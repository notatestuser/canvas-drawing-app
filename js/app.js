/* global Ember */

'use strict';

;(function(){

var App = Ember.Application.create();

App.Router.map(function() {
    // put your routes here
});

App.IndexRoute = Ember.Route.extend({});

App.IndexController = Ember.Controller.extend({
    drawingData: [],
    actions: {
        addText: function(ev) {
            var drawingData = this.get('drawingData');
            // ...
        },
        addSquare: function() {
            var drawingData = this.get('drawingData');
            // ...
        }
    }
});

App.CanvasView = Ember.View.extend({
    templateName: 'canvas',
    hammerOptions: {
        swipe_velocity: 0.5
    },
    gestures: {
        pan: function (ev) {
            // do something like send an event down the controller/route chain
            console.log('x: '+ev.deltaX);
            console.log('y: '+ev.deltaY);
            return false;  // no bubble
        }
    }
});

App.ToolboxView = Ember.View.extend({
    templateName: 'toolbox'
});

})();
