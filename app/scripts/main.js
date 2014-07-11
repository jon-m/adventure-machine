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
        items;
    
    console = new AdventureMachine.Console();
    console.init();
    
    game = new AdventureMachine.Game(console);
    
    $(console).bind('onCommand', function (e, data) {
        game.parseCommand(data.commandText, data.commandParts);
    });
    
    
    // Define a sample game - in the future, could this be read from a file? How to handle custom behaviour?
    
    // Items
    items = [
        new AdventureMachine.Item('flashlight', 'Flashlight', 'A cracked flashlight that gives off fractured but adequate lighting.', function (target) {
            if (target && target.id === 'dark-cupboard') {
                this.game.printMessage('The light of the torch reveals a plastic key card, which you pick up and place in your pocket.');
                this.game.addItemToInventory('lift-keycard');
            } else {
                this.game.print('You can\'t use this item on ' + target.title);
            }
        }),
        new AdventureMachine.Item('lift-keycard', 'Keycard', 'An electronic keycard, presumably this used to belong to an employee working in the building, and is used to gain access to authorised areas of the office.', function (target) {
            if (target && target.id === 'lift-control-panel') {
                this.game.printMessage('You swipe the keycard through the control panel, which promptly makes an eletronic chirp and displays the message "Access Granted" as the lift doors slide quietly open. You enter, and press the button for the next floor.');
                this.game.currentLocation.addExit('Lift', 'corridor-1');
            } else {
                this.game.print('You can\'t use this item on ' + target.title);
            }
        }),
        new AdventureMachine.Fixture('dark-cupboard', 'Dark cupboard', 'A service cupboard of some kind. The light is broken. In the dim light spilling into the space from the room you are standing in you can just about make out some mops and dusty shelves in the gloom, but it is too dark to see properly.'),
        new AdventureMachine.Fixture('lift-control-panel', 'Lift Control Panel', 'Next to the lifts is a control panel, the soft blue light emitted by the LCD display giving an ethereal quality to the area. It looks like some kind of key card needs to be swiped through a card reader on the side of the panel to open the lift doors.')
    ];
    
    // Locations
    startRoom = new AdventureMachine.Location('atrium', 'Atrium', 'You are standing in the atrium of an office building. The room is deserted. You see some frosted glass doors to the south, and some lift doors illuminated by the soft blue light of a control panel on the east wall.', ['flashlight', 'lift-control-panel']);
    startRoom.addExit('South', 'conferenceRoom');
    
    southRoom = new AdventureMachine.Location('conferenceRoom', 'Conference Room', 'You enter a conference room, and are greeted by rows of neatly-placed chairs illuminated by flickering lights. At the front of the room is a podium for the speaker. Loose papers are scattered on the floor next to the podium, gently fluttering in the wake of a lacklustre ceiling fan. Some of the chairs have been knocked over in the front row. Near the entrance is a narrow doorway, presumably leading to a service cupboard.', ['dark-cupboard']);
    southRoom.addExit('North', 'atrium');
    
    corridor = new AdventureMachine.Location('corridor-1', 'Upstairs Corridor', 'You emerge into a corridor. Cork boards line the walls, covered with pieces of paper and notices like "Staff Christmas Party". A number of doors lead off either side of the space.');
    corridor.addExit('Lifts', 'atrium');
    corridor.addExit('Door 1', 'room1');
    corridor.addExit('Door 2', 'room2');
    
    room1 = new AdventureMachine.Location('room1', 'Office Space', 'You spy a deserted office. One of the computers has been left on, illuminating a mug that says "You don\'t have to be mad to work here, but it sure helps!"');
    room1.addExit('Out', 'corridor-1');
    
    room2 = new AdventureMachine.Location('room2', 'More Office Space', 'You spy another deserted office. Tacked to a notice board is a poster for the christmas party, with a presentation for the best costume. The party should be in full swing - where is everyone?');
    room2.addExit('Out', 'corridor-1');
    
    game.newGame({
        name: 'The Silence',
        locations: [startRoom, southRoom, corridor, room1, room2],
        startLocation: startRoom.id,
        items: items,
        inventory: [],
        npcs: [],
        commands: []
    });
    
    // TODO: Restructure internal list of items in an inventory so that they can be retrieved as an array
    // TODO: Different descriptions if you've visited the room before. E.g. 'the man is still hiding under the desk'
    // TODO: exit description when taking a named exits, e.g. 'you quickly cross the empty space, your footsteps echoing in the vast room, and open the frosted doors with a sense of forboding'. This decouples the description of the rrom from how you arrived there.
    // TODO: Refactor 'go' command into the main game source
    // TODO: Define a Story, which can be loaded by the Game class to provide the starting location, other locations, game title etc
    // TODO: Add items & inventory
    // TODO: Add NPCs with 'tell' and 'ask' commands
    // TODO: 'look' command to re-iterate the room description, possibly updated by the users actions
    // TODO: Custom 'onEnter' callbacks for rooms
    // TODO: Source commands from 

}(jQuery)); // AdventureMachine