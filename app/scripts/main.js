/*jslint browser: true*/
/*global jQuery, AdventureMachine*/

if (!jQuery) {
    throw 'Missing dependency: compatible version of jQuery required';
}

if (!AdventureMachine) {
    throw 'Missing dependency: AdventureMachine not found';
}

/*
 * Initialises a new AdventureMachine console.
 */
(function ($) {
    'use strict';

    var console,
        game,
        startRoom,
        southRoom,
        corridor,
        room1,
        room2,
        items,
        securityGuard;
    
    console = new AdventureMachine.Console();
    console.init();
    
    game = new AdventureMachine.Game(console);
    
    $(console).bind('onCommand', function (e, data) {
        game.parseCommand(data.commandText, data.commandParts);
    });
    
    securityGuard = new AdventureMachine.NPC('security-guard', 'Security Guard', 'An aging security guard.', function () {
        //on ask
        if (this.speakingAbout('lift') === true) {
            this.reply('You need a keycard to get into the lifts. Just swipe it through the control panel to open the lift doors.');
        } else if (this.speakingAbout('key') === true) {
            this.reply('I don\'t have a keycard, that area is off-limits to us. Maybe you can find another one.');
        } else if (this.speakingAbout(['happening', 'going on', 'party']) === true) {
            this.reply('I clocked-on half an hour ago. The Christmas party was supposed to start before that, but the conference room is deserted, and there was no guard clocking-off to ask what was going on.');
        } else {
            this.reply('I don\'t know about that.');
        }
    }, function () {
            this.reply('I don\'t know anything about that.');
        }, function () {
            //on talk
            this.reply('Evening, I\'m Bernard. Are you here for the Christmas party? I don\'t know where everyone is to be honest, but the main generator\'s gone down so I guess they had to cancel.');
        });
    
    // Define a sample game - in the future, could this be read from a file? How to handle custom behaviour - i.e. avoid loading arbitrary JS?
    
    // Items
    items = [
        new AdventureMachine.Item('flashlight', 'Flashlight', 'A cracked flashlight that gives off fractured but adequate lighting.', function (target) {
            if (target && target.id === 'dark-cupboard') {
                this.game.printMessage('The light of the torch reveals a plastic key card, which you pick up and place in your pocket.');
                this.game.addItemToInventory('lift-keycard');
            } else if (target) {
                this.game.print('You can\'t use this item on ' + target.title);
            } else {
                this.game.print('You shine the flashlight around the room, making the shadows jump erratically.');
            }
        }),
        new AdventureMachine.Item('lift-keycard', 'Keycard', 'An electronic keycard, presumably this used to belong to an employee working in the building, and is used to gain access to authorised areas of the office.', function (target) {
            if (target && target.id === 'lift-control-panel') {
                this.game.printMessage('You swipe the keycard through the control panel, which promptly makes an eletronic chirp and displays the message "Access Granted" as the lift doors slide quietly open. You enter, and press the button for the next floor.');
                this.game.currentLocation.addExit('Lift', 'corridor-1');
            } else if (target) {
                this.game.print('You can\'t use this item on ' + target.title);
            } else {
                this.game.print('You can\'t use this item on its own. Is there a door that needs unlocking?');
            }
        }),
        new AdventureMachine.Fixture('dark-cupboard', 'Dark cupboard', 'A service cupboard of some kind. The light is broken. In the dim light spilling into the space from the room you are standing in you can just about make out some mops and dusty shelves in the gloom, but it is too dark to see properly.'),
        new AdventureMachine.Fixture('lift-control-panel', 'Lift Control Panel', 'Next to the lifts is a control panel, the soft blue light emitted by the LCD display giving an ethereal quality to the area. It looks like some kind of key card needs to be swiped through a card reader on the side of the panel to open the lift doors.')
    ];
    
    // Locations
    startRoom = new AdventureMachine.Location('atrium', 'Atrium', 'You are standing in the atrium of an office building. The room is deserted. You see some frosted glass doors to the south, and some lift doors illuminated by the soft blue light of a control panel on the east wall.', [
        ['South', 'conferenceRoom']
    ], ['flashlight', 'lift-control-panel'], ['security-guard']);
    
    southRoom = new AdventureMachine.Location('conferenceRoom', 'Conference Room', 'You enter a conference room, and are greeted by rows of neatly-placed chairs illuminated by flickering lights. At the front of the room is a podium for the speaker. Loose papers are scattered on the floor next to the podium, gently fluttering in the wake of a lacklustre ceiling fan. Some of the chairs have been knocked over in the front row. Near the entrance is a narrow doorway, presumably leading to a service cupboard.', [
        ['North', 'atrium']
    ], ['dark-cupboard']);
    
    corridor = new AdventureMachine.Location('corridor-1', 'Upstairs Corridor', 'You emerge into a corridor. Cork boards line the walls, covered with pieces of paper and notices like "Staff Christmas Party". A number of doors lead off either side of the space.', [
        ['Lifts', 'atrium'],
        ['Door 1', 'room1'],
        ['Door 2', 'room2']
    ]);
    
    room1 = new AdventureMachine.Location('room1', 'Office Space', 'You spy a deserted office. One of the computers has been left on, illuminating a mug that says "You don\'t have to be mad to work here, but it sure helps!"', [
        ['Out', 'corridor-1']
    ]);
    
    room2 = new AdventureMachine.Location('room2', 'More Office Space', 'You spy another deserted office. Tacked to a notice board is a poster for the christmas party, with a presentation for the best costume. The party should be in full swing - where is everyone?', [
        ['Out', 'corridor-1']
    ]);
    
    game.newGame({
        name: 'The Silence',
        locations: [startRoom, southRoom, corridor, room1, room2],
        startLocation: startRoom.id,
        items: items,
        inventory: [],
        npcs: [securityGuard],
        commands: []
    });
    
    // TODO: Test dynamic descriptions & onExit callback
    // TODO: Restructure internal list of items in an inventory so that they can be retrieved as an array
    // TODO: Custom 'onEnter' callbacks for rooms
    // TODO: Source commands from external script, as they may be genre-specific
    // TODO: Refactor custom commands into base entity & load from items, npcs when loading a room
    // TODO: Decouple console completely, using events or similar to link to game
    // TODO: Console can render command names and iteractive elements like items & npcs as links. Clicking adds text to console.
    // TODO: Button-driven commands: can click 'ask', then select an NPC from a list, then type a topic, for example
    // TODO: Cheat panel on console, select a location to go straight there, an item to add it to inventory, an NPC to add it to room etc
    // TODO: Define story from a text file. How to cope with interactive elements? Boil it down to standard text commands specific to game definitions?
    //          Can embed JavaScript with a defined contract with your environment: https://developers.google.com/caja/docs/runningjavascript/

}(jQuery)); // AdventureMachine