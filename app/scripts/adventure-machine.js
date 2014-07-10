var jQuery = jQuery || null;
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
        // Noddy Command to dsplay some text in the console output area
        EchoCommand,
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
     * TODO: Define standard 'message', 'error', 'heading' formats/methods
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
        this.display("> " + commandText);
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
     * Define the ExitCommand class, which allows users to move into new in-game locations
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
        // Items available in-game, usually by finding them in locations or given by NPCs
        this.availableItems = undefined;
        // The collection of items picked up by the player when exploring the game
        this.inventory = undefined;
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
            // TODO: Merge the general commands from the Game class with specific commands from the game data being loaded, the current NPCs, current inventory
            this.availableCommands = this.getCommands().concat(this.storyCommands).concat(this.currentLocation.getCommands());
            for (i = 0; i < this.availableCommands.length; i += 1) {
                this.availableCommands[i].game = this;
            }
            
            // TODO: Load NPCs
            
            this.displayCurrentLocationInfo();
        } else {
            this.printError('Error: "' + locationId + '" is not a valid location!');
        }
    };
    Game.prototype.displayCurrentLocationInfo = function () {
        var i,
            output,
            item,
            itemCode,
            found;
        
        this.printSectionTitle(this.currentLocation.title);
        this.printDescription(this.currentLocation.description);
        
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
        
        gameData.locations = gameData.locations || [];
        if (gameData.locations.length === 0) {
            this.printError('<span class="error">There was a problem starting this game.</span>');
            throw 'Error: Location data empty for Story "' + this.name + '"';
        }
        for (i = 0; i < gameData.locations.length; i += 1) {
            location = gameData.locations[i];
            itemCodeArray = location.itemCodes;
            this.addItemsToLocation(location, itemCodeArray);
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
            this.printError("Unable to add items to location; Location does not exist");
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
            this.printError("Unable to add items to location; No items defined");
        }
    };
    // Commands that apply to all games
    Game.prototype.getCommands = function () {
        var
            go = new CallbackCommand('go', 'Go:<br/>go &lt;destination&gt; e.g. "go south"', function (commandText, commandParts) {
                var location = this.game.currentLocation,
                    destination,
                    exit,
                    commandName;
                if (commandParts && commandParts.length && commandParts.length > 0) {
                    
                    commandName = commandParts[0];

                    if (commandName.toUpperCase() === 'GO' || commandName.toUpperCase() === 'EXIT' || commandName.toUpperCase() === 'LEAVE') {
                        if (commandParts.length === 1) {
                            this.game.printInformation('Usage:<br/>' + this.getDescription());
                        } else {
                            destination = commandParts[1];
                            exit = location.getExit(destination);
                            if (!exit) {
                                this.game.printError('"' + destination + '" is not an exit.');
                            } else {
                                this.game.goTo(exit.destinationLocationId);
                            }
                        }
                    }
                }
            }),
            help = new CallbackCommand('help', 'help &lt;<span class="command">command</span>&gt; - help on a specific command, e.g "help go"', function (commandText, commandParts) {
                var commands,
                    command,
                    i,
                    message = "";
                if (commandParts && commandParts.length && commandParts.length > 0 && commandParts[0].toUpperCase() === 'HELP') {
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
            examine = new CallbackCommand('examine', 'examine &lt;<span class="command">item</span>&gt; - examine an item, e.g "examine cupboard"', function (commandText, commandParts) {
                var items,
                    item,
                    itemCode,
                    i,
                    itemName,
                    found;
                if (commandParts && commandParts.length && commandParts.length > 0 && commandParts[0].toUpperCase() === this.getShortName().toUpperCase()) {
                    
                    if (commandParts.length === 1) {
                        this.game.printInformation('Usage:<br/>' + this.getDescription());
                    } else {
                        // Find target object in those available in the player's inventory and the current location
                        items = $.extend({}, this.game.currentLocation.items.items, this.game.inventory.items);
                        itemName = '';
                        for (i = 1; i < commandParts.length; i += 1) {
                            if (commandParts[i].length > 0) {
                                if (itemName.length > 0) {
                                    itemName += " ";
                                }
                                itemName += commandParts[i];
                            }
                        }
                        found = false;
                        for (itemCode in items) {
                            if (items.hasOwnProperty(itemCode)) {
                                item = items[itemCode];
                                if (item.title.toUpperCase() === itemName.toUpperCase()) {
                                    found = true;
                                    this.game.printDescription(item.description);
                                }
                            }
                        }
                        if (!found) {
                            this.game.printError('Unknown item: ' + itemName);
                        }
                    }
                }
            }),
            // Take an item from the current location
            take = new CallbackCommand('take', 'take &lt;<span class="command">item</span>&gt; - take an item, e.g "take key"', function (commandText, commandParts) {
                var items,
                    item,
                    itemCode,
                    i,
                    itemName,
                    found;
                
                
                if (commandParts && commandParts.length && commandParts.length > 0 && commandParts[0].toUpperCase() === this.getShortName().toUpperCase()) {
                    
                    if (commandParts.length === 1) {
                        this.game.printInformation('Usage:<br/>' + this.getDescription());
                    } else {
                        // Find target object in those available in the current location
                        items = this.game.currentLocation.items.items;
                        itemName = '';
                        for (i = 1; i < commandParts.length; i += 1) {
                            if (commandParts[i].length > 0) {
                                if (itemName.length > 0) {
                                    itemName += ' ';
                                }
                                itemName += commandParts[i];
                            }
                        }
                        found = false;
                        for (itemCode in items) {
                            if (items.hasOwnProperty(itemCode)) {
                                item = items[itemCode];
                                if (item.title.toUpperCase() === itemName.toUpperCase()) {
                                    found = true;
                                    if (item.isCollectable() === true) {
                                        this.game.currentLocation.items.takeItem(item.id);
                                        this.game.inventory.addItem(item);
                                        this.game.printInformation('"' + item.title + '" added to inventory.');
                                    } else {
                                        this.game.printError('You cannot take this item');
                                    }
                                }
                            }
                        }
                        if (!found) {
                            this.game.printError('Unknown item: ' + itemName);
                        }
                    }
                }
            }),
            // Take an item from the current location
            use = new CallbackCommand('use', 'use &lt;<span class="command">item</span>&gt; - use an item, e.g "use gold key" or "use key on blue door"', function (commandText, commandParts) {
                var simplePattern,
                    fullPattern,
                    regexResult,
                    commandName,
                    itemName,
                    targetName,
                    target,
                    item;
                
                
                if (commandText && commandText.trim().toUpperCase().startsWith(this.getShortName().toUpperCase())) {
                    
                    simplePattern = "^use[ ]+(.*)";
                    fullPattern = simplePattern + "[ ]+on[ ]+(.*)";
                    regexResult = new RegExp(fullPattern, "i").exec(commandText);
                    if (regexResult) {
                        // Full command matched
                        itemName = regexResult[1];
                        targetName = regexResult[2];
                        target = this.game.inventory.findItemByName(targetName) || this.game.currentLocation.items.findItemByName(targetName);
                    } else {
                        regexResult = new RegExp(simplePattern, "i").exec(commandText);
                        if (regexResult) {
                            // Basic command matched
                            itemName = regexResult[1];
                        }
                    }
                    
                    if (itemName) {
                        item = this.game.inventory.findItemByName(itemName) || this.game.currentLocation.items.findItemByName(itemName);
                        if (!item) {
                            this.game.printError('Can\'t find: "' + itemName + '"');
                        } else if (targetName && !target) {
                            this.game.printError('Can\'t find: "' + targetName + '"');
                        } else {
                            item.onUse(target);
                        }
                    } else {
                        // Only command name used, print usage
                        this.game.printInformation('Usage:<br/>' + this.getDescription());
                    }
                    
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
                            found = true;
                            item = items[itemCode];
                            message += '<span class="command">' + item.title + '</span><br/>';
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
            });
        
        // TODO: Other standard interactions like use, drop, ask, tell/say, combine...
        
        return [help, go, examine, take, use, inventory, look];
    };
    
    /*
     * Define the Location class. Instances of this class will represent the various places in the active game that 
     * the user can explore.
     */
    Location = function (id, title, description, itemCodes) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.exits = [];
        this.itemCodes = itemCodes || [];
        this.items = new Inventory();
    };
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
    
    /*
     * Represents a tranition point between the current location and another
     */
    Exit = function (exitName, destinationLocationId) {
        this.exitName = exitName;
        this.destinationLocationId = destinationLocationId;
    };
    
    /*
     * An item is something in the game that the player can examine, use or potentially pick up and add to their current inventory
     */
    Item = function (id, title, description, onUseCallback, usable, collectable) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.onUseCallback = onUseCallback;
        this.game = undefined;
        this.usable = (usable === undefined) ? true : usable;
        this.collectable = (collectable === undefined) ? true : collectable;
    };
    Item.prototype.onUse = function () {
        if (this.onUseCallback) {
            this.onUseCallback.apply(this, arguments);
        } else {
            return false;
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
     * their posession, the items available in a given location and so on.
     */
    Inventory = function (game, item) {
        this.game = game;
        this.items = {};
        
        if (item instanceof Item) {
            this.addItem(item);
        } else if (item instanceof Array) {
            this.addItems(item);
        }
    };
    Inventory.prototype.addItem = function (item) {
        if (item instanceof Item) {
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
                if (item && item.title.toUpperCase() === itemName.toUpperCase()) {
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
        Location: Location,
        Exit: Exit,
        Story: Story,
        Item: Item,
        Fixture: Fixture,
        Inventory: Inventory
    };

    return impl;

}(jQuery)); // AdventureMachine