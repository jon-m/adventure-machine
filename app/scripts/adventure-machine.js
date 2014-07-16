/*jslint browser: true*/
/*global jQuery*/
/*exported AdventureMachine*/

if (!jQuery) {
    throw 'Missing dependency: compatible version of jQuery required';
}

/*
 * Core AdventureMachine logic, centres around a console that allows the user to interact with a game. 
 */
var AdventureMachine = (function ($) {
    'use strict';
    
    /*
     * Extend the base String type in JS by adding support for 'startsWith'
     */
    if (typeof String.prototype.startsWith !== 'function') {
        // see below for better implementation!
        String.prototype.startsWith = function (str) {
            return this.slice(0, str.length) === str;
        };
    }

    // The console is the main area of interaction with the end user
    var Console,
        // Defines the story that informs the current Game instance
        Story,
        // The current game being played
        Game,
        // Base class used for implementing CLI commands
        Command,
        // General-purpose command that accepts a callback function to execute when the command is executed
        CallbackCommand,
        // Command that supports two forms: the command name and a target, or the command name, target preposition and second target
        // E.g. use item, use item on otheritem
        RegexCallbackCommand,
        // Starting point for interactive elements of the game, e.g. locations and NPCs
        BaseEntity,
        // Characters that the player may interact with
        NPC,
        // In-game locations
        Location,
        // Details about an available exit
        Exit,
        // The player can examine and use items in the game, and potentially pick them up
        Item,
        // Some items can't be picked up, and represent fixtures in a location that can still be examined
        Fixture,
        // Items are collectively managed via inventories
        Inventory,
        // The publicly exposed API is defined here
        impl;
    
    /*
     * Define the console class, the main point of interaction where the user can enter text-based commands and view 
     * the results. When a command is entered, a "onCommand" event is raised on the console instance that has the
     * details of the command entered.
     *
     * TODO: Factor out into completely separate component/namespace
     */
    Console = function (config) {
        this.config = undefined;
        this.inputField = undefined;
        this.outputArea = undefined;
        
        this.defaultOptions = {
            // The element that represents the console, containing both the input and output areas
            consoleContainerSelector: '.am-console',
            // Commands are read from this element under the console container
            inputFieldSelector: '.am-console-input',
            // The console output is appended to this element under the console container
            outputContainerSelector: '.am-console-output',
            // Output message are placed in paragraphs by default
            messageWrapper: '<p>'
        };
        
        if (config) {
            this.init();
        }
            
    };
    Console.prototype.init = function (options) {
        var config = this.config = $.extend({}, this.defaultOptions, options),
            container = $(config.consoleContainerSelector),
            textEntered,
            commandParts,
            thisConsole = this;
        
        this.inputField = $(config.inputFieldSelector, container);
        this.outputArea = $(config.outputContainerSelector, container);
        
        this.inputField.keyup(function (e) {
            if (e.which === 13) {
                textEntered = $(e.currentTarget).val();
                $(e.currentTarget).val('');
                commandParts = thisConsole.parse(textEntered);
                // TODO: Need to call into game to execute the command - how to handle two-way association between the Console and the Game?
                $(thisConsole).trigger('onCommand', {commandText: textEntered, commandParts: commandParts});
            }
        });
    };
    /*
     * Display a message in the console. The type of message is define dby the displayType parameter, which affects how
     * the message will be displayed.
     * Supported display types: message, title, section, subsection, description, command, error
     */
    Console.prototype.display = function (message, displayType) {
        
        var styledMessage,
            wrappedMessage;
        
        if (!displayType) {
            displayType = 'message';
        }
        
        if (displayType === 'title') {
            styledMessage = $('<h1/>').html(message);
        } else if (displayType === 'section') {
            styledMessage = $('<h2/>').html(message);
        } else if (displayType === 'subsection') {
            styledMessage = $('<h3/>').html(message);
        } else {
            styledMessage = $('<span/>').addClass(displayType).html(message);
        }
        
        // Message can already contain HTML
        wrappedMessage = $(this.config.messageWrapper).append(styledMessage);
        this.outputArea.append(wrappedMessage);
        this.outputArea.scrollTop(this.outputArea[0].scrollHeight);
    };
    Console.prototype.parse = function (commandText) {
        this.display('> ' + commandText);
        var args = [],
            readingPart = false,
            part = '',
            i;
        
        for (i = 0; i < commandText.length; i += 1) {
            if (commandText.charAt(i) === ' ' && !readingPart) {
                args.push(part);
                part = '';
            } else {
                if (commandText.charAt(i) === '\"') {
                    readingPart = !readingPart;
                } else {
                    part += commandText.charAt(i);
                }
            }
        }
        
        if (part && part.length > 0) {
            args.push(part);
        }
        return args;
    };
    
    /*
     * Define the Command class, which provides a base point for console-driven command implementations.
     When a command is added to the active game, it has the game property set appropriately
     */
    Command = function (shortName, description) {
        this.game = undefined;
        this.shortName = shortName;
        this.description = description;
    };
    Command.prototype.execute = function () {
        throw 'Cannot execute base command';
    };
    Command.prototype.getDescription = function () {
        return this.description;
    };
    Command.prototype.getShortName = function () {
        return this.shortName;
    };
    
    /*
     * Simple command that fires the provided callback
     */
    CallbackCommand = function (shortName, description, callback) {
        Command.call(this, shortName, description);
        this.callback = callback;
    };
    CallbackCommand.prototype = new Command();
    CallbackCommand.prototype.constructor = CallbackCommand;
    CallbackCommand.prototype.execute = function () {
        this.callback.apply(this, arguments);
    };
    
    /*
     * Command that parses input assuming it will be in one of two formats:
     * 1) "<command> <target>" - e.g. "use key"
     * 2) "<command> <target1> <preposition> <target2>" - e.g. "use key on door"
     * Uses regexes to match the command name and parameters based on this format, and if either format is matched will
     * execute the provided callback providing the extracted parameters. If the command does not match the format, but
     * does start with the provided command name, then the command usage description is displayed instead.
     * If the command does not start with the specified command name, then it is ignored as entered commands are passed
     * through all of the registered Command instances to find suitable handlers.
     */
    RegexCallbackCommand = function (commandName, preposition, description, callback) {
        var simplePattern,
            fullPattern;
        
        Command.call(this, commandName, description);
        
        simplePattern = '^' + commandName + '[ ]+(.*)';
        this.shortformRegex = new RegExp(simplePattern, 'i');
        
        if (preposition) {
            fullPattern = simplePattern + '[ ]+' + preposition + '[ ]+(.*)';
            this.longformRegex = new RegExp(fullPattern, 'i');
        }
        
        this.callback = callback;
        
    };
    RegexCallbackCommand.prototype = new Command();
    RegexCallbackCommand.prototype.constructor = RegexCallbackCommand;
    RegexCallbackCommand.prototype.execute = function (commandText) {
        var regexResult,
            target1,
            target2;
        
        if (commandText.toUpperCase().startsWith(this.shortName.toUpperCase())) {
            regexResult = (this.longformRegex) ? this.longformRegex.exec(commandText) : null;
            if (regexResult) {
                // Full command matched
                target1 = regexResult[1];
                target2 = regexResult[2];
            } else {
                regexResult = this.shortformRegex.exec(commandText);
                if (regexResult) {
                    // Basic command matched
                    target1 = regexResult[1];
                }
            }

            if (!target1 || target1.length === 0) {
                // Incorrect usage, e.g. only command name used, print usage
                this.game.printInformation('Usage:<br/>' + this.getDescription());
            } else {
                this.callback.apply(this, [commandText, target1, target2]);
            }
        }
        
    };
    
    
    /*
     * Define the Game class, which keeps track of the current game session (e.g. locations, items and so on).
     */
    Game = function (console) {
        this.name = undefined;
        // List of all available commands
        this.availableCommands = [];
        // List of commands defined by the story
        this.storyCommands = [];
        // The UI
        this.console = console;
        // Available locations
        this.locations = {};
        // The in-game location that the user is currently exploring
        this.currentLocation = undefined;
        // Available NPCs
        this.npcs = undefined;
        // Items available in-game, usually by finding them in locations or given by NPCs
        this.availableItems = undefined;
        // The collection of items picked up by the player when exploring the game
        this.inventory = undefined;
        // Centralised timer to manage scheduled events from NPCs, items etc
        this.centralTimer = {

            timerID: 0,
            timers: [],

            add: function (fn) {
                this.timers.push(fn);
            },

            start: function () {
                var centralTimer = this;
                if (this.timerID) {
                    return;
                }
                
                (function runNext () {
                    if (centralTimer.timers.length > 0) {
                        for (var i = 0; i < centralTimer.timers.length; i++) {
                            if (centralTimer.timers[i]() === false) {
                                centralTimer.timers.splice(i, 1);
                                i--;
                            }
                        }
                        centralTimer.timerID = setTimeout(runNext, 0);
                    }
                })();
            },

            stop: function () {
                clearTimeout(this.timerID);
                this.timerID = 0;
            },
            
            clear: function () {
                this.stop();
                this.timers = [];
            }
        };
    };
    Game.prototype.clearCommands = function () {
        this.availableCommands = [];
    };
    Game.prototype.addCommand = function (command) {
        this.availableCommands.push(command);
    };
    Game.prototype.parseCommand = function (commandText, commandParts) {
        var commands = this.availableCommands,
            command,
            i;
        
        // Allow all Command instances a chance to handle the input
        for (i = 0; i < commands.length; i += 1) {
            command = commands[i];
            if (command instanceof Command) {
                command.execute(commandText, commandParts);
            }
        }
    };
    Game.prototype.print = function (message, displayType) {
        this.console.display(message, displayType);
    };
    Game.prototype.printMessage = function (message) {
        this.console.display(message, 'message');
    };
    Game.prototype.printInformation = function (message) {
        this.console.display(message, 'information');
    };
    Game.prototype.printError = function (message) {
        this.print(message, 'error');
    };
    Game.prototype.printGameTitle = function (message) {
        this.print(message, 'title');
    };
    Game.prototype.printSectionTitle = function (message) {
        this.print(message, 'section');
    };
    Game.prototype.printSubsectionTitle = function (message) {
        this.print(message, 'subsection');
    };
    Game.prototype.printDescription = function (message) {
        this.print(message, 'description');
    };
    Game.prototype.printCommand = function (message) {
        this.print(message, 'command');
    };
    Game.prototype.addLocation = function (location) {
        if (location instanceof Location) {
            this.locations[location.id] = location;
        }
    };
    Game.prototype.goTo = function (locationId) {
        var i;
        
        if (this.locations[locationId]) {
            
            this.currentLocation = this.locations[locationId];
            this.currentLocation.incrementVisits();
            // TODO: Merge these commands with the ones provided by loaded NPCs
            this.availableCommands = this.getCommands().concat(this.storyCommands).concat(this.currentLocation.getCommands());
            for (i = 0; i < this.availableCommands.length; i += 1) {
                this.availableCommands[i].game = this;
            }
            
            this.displayCurrentLocationInfo();
            
            this.centralTimer.clear();
            if (this.currentLocation.onTickCallback) {
                this.centralTimer.add(this.currentLocation.onTickCallback);
            }
        } else {
            this.printError('Error: "' + locationId + '" is not a valid location!');
        }
    };
    Game.prototype.displayCurrentLocationInfo = function () {
        var i,
            output,
            item,
            itemCode,
            npc,
            npcCode,
            found;
        
        this.printSectionTitle(this.currentLocation.getTitle());
        this.printDescription(this.currentLocation.getDescription());
        
        output = 'Available exits:<br/>';
        found = false;
        for (i = 0; i < this.currentLocation.exits.length; i += 1) {
            found = true;
            output += '<span class="location">' + this.currentLocation.exits[i].exitName + '</span><br/>';
        }
        if (found === true) {
            this.printInformation(output);
        }

        if (this.currentLocation.items.items) {
            output = 'Items:<br/>';
            found = false;
            for (itemCode in this.currentLocation.items.items) {
                if (this.currentLocation.items.items.hasOwnProperty(itemCode)) {
                    item = this.currentLocation.items.getItem(itemCode);
                    if (item) {
                        found = true;
                        output += '<span class="location">' + item.title + '</span><br/>';
                    }
                }
            }
            if (found === true) {
                this.printInformation(output);
            }
        }
        
        if (this.currentLocation.npcs) {
            output = 'NPCs:<br/>';
            found = false;
            for (npcCode in this.currentLocation.npcs.items) {
                if (this.currentLocation.npcs.items.hasOwnProperty(npcCode)) {
                    npc = this.currentLocation.npcs.getItem(npcCode);
                    if (npc) {
                        found = true;
                        output += '<span class="location">' + npc.title + '</span><br/>';
                    }
                }
            }
            if (found === true) {
                this.printInformation(output);
            }
        }
        
    };
    // Start a new game
    Game.prototype.newGame = function (gameData) {
        var i,
            location,
            itemCodeArray;
        
        this.clearCommands();
        
        this.name = gameData.name;
        this.npcs = gameData.npcs || [];
        this.storyCommands = gameData.commands || [];
        
        this.availableItems = new Inventory(this, gameData.items);
        this.inventory = new Inventory(this);
        this.addItemsToInventory(gameData.inventory);
        this.npcs = new Inventory(this, gameData.npcs);
        
        gameData.locations = gameData.locations || [];
        if (gameData.locations.length === 0) {
            this.printError('<span class="error">There was a problem starting this game.</span>');
            throw 'Error: Location data empty for Story "' + this.name + '"';
        }
        for (i = 0; i < gameData.locations.length; i += 1) {
            location = gameData.locations[i];
            itemCodeArray = location.itemCodes;
            this.addItemsToLocation(location, itemCodeArray);
            itemCodeArray = location.npcCodes;
            this.addNpcsToLocation(location, itemCodeArray);
            this.locations[location.id] = location;
        }
        
        this.printGameTitle(gameData.name);
        this.printInformation('Type "<span class="help">help</span>" for a list of commands');
        this.goTo(gameData.startLocation);
    };
    Game.prototype.addItemToInventory = function (itemCode) {
        var item = this.availableItems.getItem(itemCode);
        if (!item) {
            this.printError('Unable to add item "' + itemCode + '" to inventory; Item does not exist.');
        } else {
            this.inventory.addItem(item);
            this.printInformation('Item "' + itemCode + '" added to inventory');
        }
        
    };
    Game.prototype.addItemsToInventory = function (itemCodeArray) {
        var i,
            itemCode;
        
        if (itemCodeArray && itemCodeArray instanceof Array) {
            for (i = 0; i < itemCodeArray.length; i += 1) {
                itemCode = itemCodeArray[i];
                this.addItemToInventory(itemCode);
            }
        }
        
    };
    Game.prototype.addItemToCurrentLocation = function (itemCode) {
        this.addItemsToCurrentLocation([itemCode]);
        
    };
    Game.prototype.addItemsToCurrentLocation = function (itemCodeArray) {
        this.addItemsToLocation(this.currentLocation, itemCodeArray);
    };
    Game.prototype.addItemsToLocation = function (location, itemCodeArray) {
        var i,
            itemCode,
            item;
        
        if (!location || !location instanceof Location) {
            this.printError('Unable to add items to location; Location does not exist');
        } else if (itemCodeArray && itemCodeArray instanceof Array) {
            for (i = 0; i < itemCodeArray.length; i += 1) {
                itemCode = itemCodeArray[i];
                item = this.availableItems.getItem(itemCode);
                if (!item) {
                    this.printError('Unable to add item "' + itemCode + '" to location; Item does not exist.');
                } else {
                    location.addItem(item);
                }
            }
        } else {
            this.printError('Unable to add items to location; No items defined');
        }
    };
    Game.prototype.addNpcsToLocation = function (location, npcCodeArray) {
        var i,
            npcCode,
            npc;
        
        if (!location || !location instanceof Location) {
            this.printError('Unable to add NPCs to location; Location does not exist');
        } else if (npcCodeArray && npcCodeArray instanceof Array) {
            for (i = 0; i < npcCodeArray.length; i += 1) {
                npcCode = npcCodeArray[i];
                npc = this.npcs.getItem(npcCode);
                if (!npc) {
                    this.printError('Unable to add NPC "' + npcCode + '" to location; NPC does not exist.');
                } else {
                    location.addNpc(npc);
                }
            }
        } else {
            this.printError('Unable to add items to location; No items defined');
        }
    };
    // Commands that apply to all games
    Game.prototype.getCommands = function () {
        var
            go = new RegexCallbackCommand('go', null, 'Go:<br/>go &lt;destination&gt; e.g. "go south"', function (commandText, destination) {
                var location = this.game.currentLocation,
                    exit;
                
                exit = location.getExit(destination);
                if (!exit) {
                    this.game.printError('"' + destination + '" is not an exit.');
                } else {
                    this.game.goTo(exit.destinationLocationId);
                }
            }),
            // Just another name for go, a bit nicer to read.
            // TODO: Rework to reuse go instance
            enter = new RegexCallbackCommand('enter', null, 'Enter:<br/>go &lt;destination&gt; e.g. "Enter Door 1"', function (commandText, destination) {
                var location = this.game.currentLocation,
                    exit;
                
                exit = location.getExit(destination);
                if (!exit) {
                    this.game.printError('"' + destination + '" is not an exit.');
                } else {
                    this.game.goTo(exit.destinationLocationId);
                }
            }),
            supergo = new RegexCallbackCommand('supergo', null, 'SuperGo:<br/>supergo &lt;location code&gt; - debug tool e.g. "supergo room1"', function (commandText, destination) {
                this.game.goTo(destination);
            }),
            supertake = new RegexCallbackCommand('supertake', null, 'SuperTake:<br/>supergo &lt;item code&gt; - debug tool e.g. "supertake flashlight"', function (commandText, itemcode) {
                this.game.addItemToInventory(itemcode);
            }),
            help = new CallbackCommand('help', 'help &lt;<span class="command">command</span>&gt; - help on a specific command, e.g "help go"', function (commandText, commandParts) {
                var commands,
                    command,
                    i,
                    message = '';
                
                if (commandText && commandText.toUpperCase().startsWith(this.shortName.toUpperCase())) {
                    commands = this.game.availableCommands;
                    if (commandParts.length > 1) {
                        // Find command and print 
                        for (i = 0; i < commands.length; i += 1) {
                            command = commands[i];
                            if (command instanceof Command && command.getShortName().toUpperCase() === commandParts[1].toUpperCase()) {
                                this.game.printInformation(command.getDescription());
                            }
                        }
                    } else {
                        message += 'Help:<br/>Type one of the following commands:<br/>';
                        // Fetch description from every available command
                        for (i = 0; i < commands.length; i += 1) {
                            command = commands[i];
                            if (command instanceof Command) {
                                if (command.getShortName() !== this.getShortName()) {
                                    message += '<span class="command">' + command.getShortName() + '</span><br/>';
                                }
                            }
                        }
                        message += this.getDescription() + '<br/>';
                        this.game.printInformation(message);
                    }
                }
            }),
            examine = new RegexCallbackCommand('examine', null, 'examine &lt;<span class="command">item/npc</span>&gt; - examine an item or NPC, e.g "examine cupboard" or "examine clerk"', function (commandText, itemName) {
                var item;
                    
                // Find target object in those available in the player's inventory and the current location
                item = this.game.inventory.findItemByName(itemName) || this.game.currentLocation.items.findItemByName(itemName) || this.game.currentLocation.npcs.findItemByName(itemName);
                if (item) {
                    this.game.printDescription(item.description);
                } else {
                    this.game.printError('Unknown item: ' + itemName);
                }
            }),
            // Take an item from the current location
            take = new RegexCallbackCommand('take', null, 'take &lt;<span class="command">item</span>&gt; - take an item, e.g "take key"', function (commandText, itemName) {
                var item;
                
                // Find target object in those available in the current location
                item = this.game.currentLocation.items.findItemByName(itemName);
                if (item) {
                    if (item.isCollectable() === true) {
                        this.game.currentLocation.items.takeItem(item.id);
                        this.game.inventory.addItem(item);
                        this.game.printInformation('"' + item.title + '" added to inventory.');
                    } else {
                        this.game.printError('You cannot take this item');
                    }
                } else {
                    this.game.printError('Unknown item: ' + itemName);
                }
                
            }),
            // Use an item, on its own or on another item or NPC
            use = new RegexCallbackCommand('use', 'on', 'use &lt;<span class="command">item</span>&gt; - use an item, e.g "use gold key" or "use key on blue door"', function (commandText, itemName, targetName) {
                var target,
                    item;
                
                item = this.game.inventory.findItemByName(itemName) || this.game.currentLocation.items.findItemByName(itemName);
                if (targetName) {
                    target = this.game.inventory.findItemByName(targetName) || this.game.currentLocation.items.findItemByName(targetName) || this.game.currentLocation.npcs.findItemByName(itemName);
                }
                
                if (!item) {
                    this.game.printError('Can\'t find: "' + itemName + '"');
                } else {
                       
                    if (targetName) {
                        if (!target) {
                            this.game.printError('Can\'t find: "' + targetName + '"');
                        } else {
                            item.onUse(target);
                        }
                    } else {
                        item.onUse();
                    }
                
                }
                 
            }),
            // Drop an item, removing it from the player's inventory and leaving it in the current location
            drop = new RegexCallbackCommand('drop', null, 'drop &lt;<span class="command">item</span>&gt; - drop an item, e.g "drop gold key"', function (commandText, itemName) {
                var item = this.game.inventory.findItemByName(itemName);
                
                if (!item) {
                    this.game.printError('Can\'t find: "' + itemName + '"');
                } else {
                    this.game.inventory.removeItem(item.id);
                    this.game.currentLocation.items.addItem(item);
                    this.game.printInformation('Dropped "' + item.title + '"');
                }
                 
            }),
            // Display the collection of items currently in the player's posession
            inventory = new CallbackCommand('inventory', 'inventory - display the items currently in your posession', function (commandText) {
                var items,
                    item,
                    itemCode,
                    message,
                    found;
                if (commandText && commandText.trim().toUpperCase() === this.getShortName().toUpperCase()) {
                    
                    items = this.game.inventory.items;
                    message = 'Inventory:<br/>';
                    found = false;
                    for (itemCode in items) {
                        if (items.hasOwnProperty(itemCode)) {
                            item = items[itemCode];
                            if (item) {
                                found = true;
                                message += '<span class="command">' + item.title + '</span><br/>';
                            }
                        }
                    }
                    if (!found) {
                        message += 'You don\'t have any items in your inventory yet.';
                    }
                    this.game.printInformation(message);
                }
            }),
            // Take an item from the current location
            look = new CallbackCommand('look', 'look - display information about the current location', function (commandText) {
                if (commandText && commandText.trim().toUpperCase() === this.getShortName().toUpperCase()) {
                    this.game.displayCurrentLocationInfo();
                }
            }),
            // Ask an NPC about a particular topic
            ask = new RegexCallbackCommand('ask', 'about', 'ask &lt;<span class="command">NPC</span>&gt; about &lt;topic&gt; - ask an NPC about a topic, e.g "ask clerk about accounts"', function (commandText, npcName, topic) {
                var npc;
                
                npc = this.game.currentLocation.npcs.findItemByName(npcName);
                if (!npc) {
                    this.game.printError('Can\'t find: "' + npcName + '"');
                } else if (!topic || topic.trim().length === 0) {
                    this.game.printError('You must specify a topic to ask about, e.g. "ask ' + npc.getTitle() + ' about topic"');
                } else {
                    npc.onAsk(topic);
                }
                 
            }),
            // Tell an NPC about a particular topic
            tell = new RegexCallbackCommand('tell', 'about', 'tell &lt;<span class="command">NPC</span>&gt; about &lt;topic&gt; - tell an NPC about a topic, e.g "tell clerk about missing money"', function (commandText, npcName, topic) {
                var npc;
                
                npc = this.game.currentLocation.npcs.findItemByName(npcName);
                if (!npc) {
                    this.game.printError('Can\'t find: "' + npcName + '"');
                } else if (!topic || topic.trim().length === 0) {
                    this.game.printError('You must specify a topic to talk about, e.g. "tell ' + npc.getTitle() + ' about topic"');
                } else {
                    npc.onTell(topic);
                }
                 
            }),
            // Talk to an NPC
            talk = new RegexCallbackCommand('talk to', 'about', 'talk to &lt;<span class="command">NPC</span>&gt; about &lt;topic&gt; - tell an NPC, e.g "talk to shopkeeper" or "talk to clerk about the weather"', function (commandText, npcName, topic) {
                var npc;
                
                npc = this.game.currentLocation.npcs.findItemByName(npcName);
                if (!npc) {
                    this.game.printError('Can\'t find: "' + npcName + '"');
                } else {
                    npc.onTalk(topic);
                }
            }),
            // Give an item to an NPC
            give = new RegexCallbackCommand('give', 'to', 'give &lt;<span class="command">item</span>&gt; about &lt;<span class="command">NPC</span>&gt; - give an item to an NPC, e.g "give money to shopkeeper"', function (commandText, itemName, npcName) {
                var item,
                    npc;
                
                item = this.game.inventory.findItemByName(itemName) || this.game.currentLocation.items.findItemByName(itemName);
                if (!item) {
                    this.game.printError('Can\'t find: "' + itemName + '"');
                } else if (!npcName) {
                    this.game.printError('You must specify an NPC to give the item to.');
                }
                
                npc = this.game.currentLocation.npcs.findItemByName(npcName);
                if (!npc) {
                    this.game.printError('Can\'t find: "' + npcName + '"');
                } else {
                    npc.onGive(item);
                }
                 
            });
        
        // TODO: Other standard interactions like give, combine...
        
        return [help, go, enter, examine, take, use, drop, inventory, look, ask, tell, talk, give, supergo, supertake];
    };
    
    /*
     * Base entity that provides a starting point for functionality relating to in-game entities that the player can
     * interact with, namely items, locations and NPCs
     * Provides the ability to have static or dynamic titles and descriptions, and to have primitive scheduled behaviour
     * used a simple timer (a single timer is shared across all entities).
     */
    BaseEntity = function (id, title, description, onTickCallback, tickInterval) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.onTickCallback = onTickCallback;
        this.tickInterval = tickInterval;
        this.game = undefined;
    };
    BaseEntity.prototype.getDescription = function () {
        var description;
        if (this.description instanceof Function) {
            description = this.description.call(this);
        } else {
            description = this.description;
        }
        
        return description;
    };
    BaseEntity.prototype.getTitle = function () {
        var title;
        if (this.title instanceof Function) {
            title = this.title.call(this);
        } else {
            title = this.title;
        }
        
        return title;
    };
    
    /*
     * Define NPCs, (non-player) characters that can be interacted with in-game.
     */
    NPC = function (id, title, description, onAskCallback, onTellCallback, onTalkCallback, onGiveCallback, onUseCallback) {
        BaseEntity.call(this, id, title, description);
        
        this.onAskCallback = onAskCallback;
        this.onTellCallback = onTellCallback;
        this.onTalkCallback = onTalkCallback;
        this.onGiveCallback = onGiveCallback;
        this.onUseCallback = onUseCallback;
        this.currentTopic = undefined;
    };
    NPC.prototype = new BaseEntity();
    NPC.prototype.constructor = NPC;
    NPC.prototype.reply = function (text) {
        this.game.printMessage('<span class="location">' + this.getTitle() + '</span>: ' + text);
    };
    NPC.prototype.onAsk = function (topic) {
        this.currentTopic = topic;
        if (this.onAskCallback && this.onAskCallback instanceof Function) {
            this.onAskCallback.apply(this, arguments);
        } else {
            this.reply('I don\'t know anything about that.');
        }
    };
    NPC.prototype.onTell = function (topic) {
        this.currentTopic = topic;
        if (this.onTellCallback && this.onTellCallback instanceof Function) {
            this.onTellCallback.apply(this, arguments);
        } else {
            this.reply('I don\'t know anything about that.');
        }
    };
    NPC.prototype.onTalk = function (topic) {
        this.currentTopic = topic;
        if (this.onTalkCallback && this.onTalkCallback instanceof Function) {
            this.onTalkCallback.apply(this, arguments);
        } else {
            this.reply('Can I help you?');
        }
    };
    NPC.prototype.onGive = function () {
        if (this.onGiveCallback && this.onGiveCallback instanceof Function) {
            this.onGiveCallback.apply(this, arguments);
        } else {
            this.reply('No thanks.');
        }
    };
    NPC.prototype.onUse = function () {
        if (this.onUseCallback && this.onUseCallback instanceof Function) {
            this.onUseCallback.apply(this, arguments);
        } else {
            this.reply('What are you doing?');
        }
    };
    // Performs some simple matching on the question being asked of the NPC
    NPC.prototype.speakingAbout = function (topics) {
        var relevant,
            i,
            topic,
            statement;
        
        relevant = false;
        statement = (this.currentTopic || '').toUpperCase();
        if (topics instanceof Array === false) {
            topics = [topics];
        }
        
        if (topics && topics instanceof Array && statement && statement.trim().length > 0) {
            for (i = 0; i < topics.length && relevant === false; i += 1) {
				topic = (topics[i] || '').toUpperCase();
                if (statement.indexOf(topic) >= 0) {
                    relevant = true;
                }
            }
        }
        
        return relevant;
    };
    
    
    /*
     * Define the Location class. Instances of this class will represent the various places in the active game that 
     * the user can explore.
     */
    Location = function (id, title, description, exits, itemCodes, npcCodes) {
        var i,
            exit;
        
        BaseEntity.call(this, id, title, description);
        
        this.exits = [];
        this.itemCodes = itemCodes || [];
        this.items = new Inventory();
        this.npcCodes = npcCodes || [];
        this.npcs = new Inventory();
        this.visits = 0;
        
        if (exits && exits instanceof Array) {
            for (i = 0; i < exits.length; i += 1) {
                exit = exits[i];
                if (exit instanceof Array && exit.length >= 2) {
                    //onExitCallback = undefined;
                    if (exit.length >= 3) {
                        //onExitCallback = exit[2];
                    }
                    this.addExit(exit[0], exit[1], exit[2]);
                } else if (exit instanceof Exit) {
                    this.exits.push(exit);
                }
            }
        }
    };
    Location.prototype = new BaseEntity();
    Location.prototype.constructor = Location;
    Location.prototype.addExit = function (exitName, destinationLocationId) {
        this.exits.push(new Exit(exitName, destinationLocationId));
    };
    // Find the Exit instance with the provided on-screen name
    Location.prototype.getExit = function (exitName) {
        var i,
            exit,
            thisExit;
        
        for (i = 0; i < this.exits.length && !exit; i += 1) {
            thisExit = this.exits[i];
            if (thisExit.exitName.toUpperCase() === exitName.toUpperCase()) {
                exit = thisExit;
            }
        }
        
        return exit;
    };
    Location.prototype.getCommands = function () {
        return [];
    };
    Location.prototype.addItem = function (item) {
        this.items.addItem(item);
    };
    Location.prototype.addNpc = function (npc) {
        this.npcs.addItem(npc);
    };
    Location.prototype.incrementVisits = function () {
        this.visits += 1;
    };
    
    /*
     * Represents a tranition point between the current location and another
     */
    Exit = function (exitName, destinationLocationId, onExitCallback) {
        this.exitName = exitName;
        this.destinationLocationId = destinationLocationId;
        this.onExitCallback = onExitCallback;
    };
    Exit.prototype.onExit = function () {
        if (this.onExitCallback && this.onExitCallback instanceof Function) {
            this.onExitCallback.call(this);
        }
    };
    
    /*
     * An item is something in the game that the player can examine, use or potentially pick up and add to their current inventory
     */
    Item = function (id, title, description, onUseCallback, usable, collectable) {
        BaseEntity.call(this, id, title, description);
        
        this.onUseCallback = onUseCallback;
        this.game = undefined;
        this.usable = (usable === undefined) ? true : usable;
        this.collectable = (collectable === undefined) ? true : collectable;
    };
    Item.prototype = new BaseEntity();
    Item.prototype.constructor = Item;
    Item.prototype.onUse = function (target) {
        if (this.onUseCallback) {
            this.onUseCallback.apply(this, arguments);
        } else if (target && target instanceof NPC) {
            target.onUse();
        }
    };
    // Can the item be picked up and added to the player's inventory? E.g. flashlight: yes, filing cabinet: no
    Item.prototype.isCollectable = function () {
        return this.collectable;
    };
    // Can the item be used in some way?
    Item.prototype.isUsable = function () {
        return this.usable;
    };
    
    
    /*
     * Define a Fixture class, which represents an item that can't be picked up, e.g a filing cabinet
     */
    Fixture = function (id, title, description, onUseCallback, usable) {
        Item.call(this, id, title, description, onUseCallback, usable, false);
    };
    Fixture.prototype = new Item();
    Fixture.prototype.constructor = Fixture;
    
    /*
     * The Inventory class is how collections of items are managed, e.g. the player's current inventory of items in
     * their posession, the items available in a given location and so on. Also used to manage NPCs
     */
    Inventory = function (game, item) {
        this.game = game;
        this.items = {};
        
        if (item instanceof BaseEntity) {
            this.addItem(item);
        } else if (item instanceof Array) {
            this.addItems(item);
        }
    };
    Inventory.prototype.addItem = function (item) {
        if (item instanceof BaseEntity) {
            if (this.game) {
                item.game = this.game;
            }
            this.items[item.id] = item;
        }
    };
    Inventory.prototype.addItems = function (itemsArray) {
        var i,
            item;
        
        for (i = 0; i < itemsArray.length; i += 1) {
            item = itemsArray[i];
            this.addItem(item);
        }
    };
    Inventory.prototype.getItem = function (itemId) {
        return this.items[itemId];
    };
    Inventory.prototype.removeItem = function (itemId) {
        this.items[itemId] = undefined;
    };
    Inventory.prototype.takeItem = function (itemId) {
        var item = this.getItem(itemId);
        this.removeItem(itemId);
        
        return item;
    };
    // Retrieve an item by name (case insensitive). Should be improved with some kind of fuzzy matching.
    Inventory.prototype.findItemByName = function (itemName) {
        var item,
            itemCode;
        
        for (itemCode in this.items) {
            if (this.items.hasOwnProperty(itemCode)) {
                item = this.items[itemCode];
                if (item && item.title.toUpperCase() === itemName.trim().toUpperCase()) {
                    return item;
                }
            }
        }
        
        return null;
    };
    
    // Publicly visible portion of the implementation of AdventureMachine
    impl = {
        Console: Console,
        Game: Game,
        Command: Command,
        CallbackCommand: CallbackCommand,
        RegexCallbackCommand: RegexCallbackCommand,
        Story: Story,
        BaseEntity: BaseEntity,
        Location: Location,
        Exit: Exit,
        NPC: NPC,
        Item: Item,
        Fixture: Fixture,
        Inventory: Inventory
    };

    return impl;

}(jQuery)); // AdventureMachine