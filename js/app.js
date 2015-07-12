/* global jQuery */
/* global Hammer */
/* global Ember */

'use strict';

;(function(){

var RESIZE_HANDLE_SIZE_PX = 16;

var STATE_DRAGGING = 'dragging';
var STATE_RESIZING = 'resizing';
var STATE_NONE = 'none';

// please excuse this - it avoids an image load wait/callback when drawing the canvas background
var PATTERN_IMAGE_SRC = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQBAMAAADt3eJSAAAAD1BMVEX////e3t7b29vV1dXQ0NAEqASxAAAAG0lEQVQI12MQBAIGIKCQQboGRRjDCMZwBgoBADakBLSSaB4SAAAAAElFTkSuQmCC';

var CANVAS_TEXT_FONT  = 'Helvetica,sans-serif';

// ----- //

var reqAnimationFrame = (function () {
    return window[Hammer.prefixed(window, 'requestAnimationFrame')] || function (callback) {
        window.setTimeout(callback, 1000 / 60);
    };
})();

// ----- //

var App = Ember.Application.create();

//  IndexRoute
// ----------------
App.IndexRoute = Ember.Route.extend({});

//  IndexController
// ----------------
App.IndexController = Ember.ArrayController.extend({
    updateSeq: 0,  // items update sequence: observing an array seems difficult
    actions: {
        addText: function() {
            var items = this.get('model');
            items.push({
                type: 'text',
                x: 16, y: 16,
                size: 24,
                text: 'Double tap to change text'
            });
            this.set('model', items);
            this._incrementUpdateSeq.call(this);
        },
        addSquare: function() {
            var items = this.get('model');
            items.push({
                type: 'square',
                x: 16,  y: 16,
                w: 128, h: 128
            });
            this.set('model', items);
            this._incrementUpdateSeq.call(this);
        },
        handleItemChanged: function() {
            this._incrementUpdateSeq.call(this);
        },
        handleItemSelected: function(selectedItem) {
            var items = this.get('model');
            items.forEach(function(item) {
                item._isSelected = (selectedItem === item) ? true : undefined;
            });
            this._incrementUpdateSeq.call(this);
        },
        clearSelection: function() {
            this._actions.handleItemSelected.call(this, null);
        }
    },
    _incrementUpdateSeq: function() {
        // the update sequence is observed by the canvas, which redraws when it changes
        // this is an easy way to get around having to watch an array and
        // all of the properties of each of its elements. that would be expensive!
        var currentSeq = this.get('updateSeq');
        this.set('modelJSON', this._getJSONModel.call(this));
        this.set('updateSeq', currentSeq + 1);
    },
    _getJSONModel: function() {
        var items = this.get('model');
        items = items.map(function(item) {
            item = Ember.copy(item);
            delete item._dimensions;
            delete item._isSelected;
            return item;
        });
        return JSON.stringify(items);
    }
});

//  CanvasView
// ----------------
App.CanvasView = Ember.View.extend({
    templateName: 'views/canvas',
    classNameBindings: ['state'],
    state: STATE_NONE,
    hammerOptions: {
        recognizers: [
            [ Hammer.Tap,   { taps: 2 } ],
            [ Hammer.Press, { time: 10 } ],
            [ Hammer.Pan,   { threshold: 0 } ]
        ]
    },
    gestures: {
        tap: function(ev) {
            var tapItem = this._detectItemHit.call(this, ev);
            if ( ! tapItem || tapItem.type !== 'text') return;
            tapItem.text = window.prompt('Enter the new text for this item', tapItem.text);
            this.get('controller').send('handleItemChanged');
        },
        press: function(ev) {
            var dragItem = this._detectItemHit.call(this, ev);
            var resizeItem = this._detectResizeHandleHit.call(this, ev);
            if ( ! dragItem && ! resizeItem) {  // no hit
                return this.get('controller').send('clearSelection');
            }
            this.get('controller').send('handleItemSelected', dragItem);

        },
        panstart: function(ev) {  // hit detect
            var dragItem = this._detectItemHit.call(this, ev);
            var resizeItem = this._detectResizeHandleHit.call(this, ev);
            if ( ! dragItem && ! resizeItem) {  // no hit
                return this.get('controller').send('clearSelection');
            }
            if (dragItem) {  // drag hit. set the dragging state
                this.set('state', STATE_DRAGGING);
                this.set('dragItem', dragItem);
                this.set('dragItemStartPos', {
                    x: dragItem.x,
                    y: dragItem.y
                });
            } else {  // set the resizing state
                this.set('state', STATE_RESIZING);
                this.set('resizeItem', resizeItem);
                this.set('resizeItemStartSize', {
                    w: resizeItem.w,
                    h: resizeItem.h,
                    size: resizeItem.size  // for font size
                });
            }
            this.get('controller').send('handleItemSelected', dragItem || resizeItem);
        },
        pan: function(ev) {
            // find the matching item, move it
            if (STATE_DRAGGING === this.get('state')) {
                var dragItem = this.get('dragItem');
                var dragItemStartPos = this.get('dragItemStartPos');
                dragItem.x = dragItemStartPos.x + ev.deltaX;
                dragItem.y = dragItemStartPos.y + ev.deltaY;
            } else if (STATE_RESIZING === this.get('state')) {
                var resizeItem = this.get('resizeItem');
                var resizeItemStartSize = this.get('resizeItemStartSize');
                var resizeUnits = Math.max(ev.deltaX, ev.deltaY);
                if (resizeItem.size) {
                    resizeItem.size = Math.max(0, resizeItemStartSize.size + resizeUnits);
                } else {
                    resizeItem.w = resizeItem.h = Math.max(0, resizeItemStartSize.w + resizeUnits);
                }
            }
            this.get('controller').send('handleItemChanged');
            return false;  // no bubble up
        },
        panend: function() {
            this.set('state', STATE_NONE);  // others: dragging, resizing
        }
    },
    _detectItemHit: function(ev) {
        var controller = this.get('controller');
        var items = controller.get('model');
        var matches;
        // -> match an item with our drag on the canvas
        matches = items.filter(function(item) {
            return this._isPointerWithinBounds.call(  // call() because this gets lost
                this, ev,
                item.x, item.y,
                item._dimensions.w,
                item._dimensions.h
            );
        }, this);
        // -> abort if no items were matched
        if ( ! matches.length) return;
        return matches[0];
    },
    _detectResizeHandleHit: function(ev) {
        var controller = this.get('controller');
        var items = controller.get('model');
        var matches;
        // -> match an item with our drag on the canvas
        matches = items.filter(function(item) {
            return this._isPointerWithinBounds.call(
                this, ev,
                item.x + item._dimensions.w + RESIZE_HANDLE_SIZE_PX / 2,
                item.y + item._dimensions.h + 8,
                RESIZE_HANDLE_SIZE_PX,
                RESIZE_HANDLE_SIZE_PX);
        }, this);
        // -> abort if no items were matched
        if ( ! matches.length) return;
        return matches[0];
    },
    _isPointerWithinBounds: function(ev, x, y, w, h) {
        var cursor;
        function detectHit(cursor, itemX, itemY, itemW, itemH) {
            return (
                (cursor.x >= itemX && cursor.x <= itemX + itemW) &&
                (cursor.y >= itemY && cursor.y <= itemY + itemH)
            );
        }
        if (ev.pointerType === 'touch') {
            cursor = {
                x: ev.pointers[0].pageX - ev.pointers[0].target.offsetLeft,
                y: ev.pointers[0].pageY - ev.pointers[0].target.offsetTop
            };
        } else if (typeof ev.srcEvent.layerX === 'number') {
            cursor = {
                x: ev.srcEvent.layerX,
                y: ev.srcEvent.layerY
            };
        } else {
            cursor = {
                x: ev.srcEvent.offsetX,
                y: ev.srcEvent.offsetY
            };
        }
        return detectHit(cursor, x, y, w, h);
    }
});

//  ToolboxView
// ----------------
App.ToolboxView = Ember.View.extend({
    templateName: 'views/toolbox'
});

//  CanvasElementComponent
// -------------------------
App.CanvasElementComponent = Ember.Component.extend({
    tagName: 'canvas',
    classNames: ['drawapp-canvas'],
    // didInsertElement: I think this is basically like init
    // we want the element to be ready, so we can't use the actual init
    didInsertElement: function() {
        var element  = this.get('element');
        var $element = jQuery(element);
        // width and height must be set as element attributes for the viewport to be set correctly
        var w = $element.width();
        var h = $element.height();
        $element.attr({
            width: w,
            height: h
        });
        this.set('ctx', element.getContext('2d'));
        this._empty();
        this._draw();
    },
    requestDraw: function() {
        if (this._isTicking) return;
        this._isTicking = true;
        reqAnimationFrame(this._draw.bind(this));
    }.observes('updateSeq'),
    _empty: function() {
        var element = this.get('element');
        var ctx = this.get('ctx');
        if ( ! ctx) return;
        var img = new Image();
        img.src = PATTERN_IMAGE_SRC;
        var pattern = ctx.createPattern(img, 'repeat');
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, element.width, element.height);
    },
    _draw: function() {
        var ctx = this.get('ctx');
        var items = this.get('items');
        if ( ! ctx || ! items) return;
        this._empty();
        items.forEach(function(item) {
            var dimensions;
            switch (item.type) {
            case 'text':
                dimensions = this._drawText(item.x, item.y, item.text, item.size);
                break;
            case 'square':
                dimensions = this._drawSquare(item.x, item.y, item.w, item.h);
                break;
            }
            // hack: set the render dimensions on the item
            item._dimensions = dimensions;
            if (item._isSelected) {
                this._drawCurrentSelectionBox(item.x, item.y, dimensions.w, dimensions.h);
            }
        }, this);
        this._isTicking = false;
    },
    _drawText: function(x, y, text, size) {
        var ctx = this.get('ctx');
        var measurements;
        if ( ! ctx) return;
        ctx.fillStyle = 'black';
        ctx.font = size + 'px ' + CANVAS_TEXT_FONT;
        ctx.fillText(text, x, y + size);
        measurements = ctx.measureText(text);
        return {  // returns dimensions
            w: measurements.width,
            h: size
        };
    },
    _drawSquare: function(x, y, w, h) {
        var ctx = this.get('ctx');
        if ( ! ctx) return;
        ctx.fillStyle = 'yellow';
        ctx.fillRect(x, y, w, h);
        return {
            w:  w,
            h: h
        };
    },
    _drawCurrentSelectionBox: function(x, y, w, h) {
        var ctx = this.get('ctx');
        var handlePx = RESIZE_HANDLE_SIZE_PX;
        var gapPx = handlePx / 2;
        if ( ! ctx) return;
        ctx.strokeStyle = 'silver';
        ctx.strokeRect(x - gapPx, y - gapPx, w + handlePx, h + handlePx);
        // handles
        ctx.fillStyle = 'black';
        // -> bottom right handle (main)
        ctx.fillRect(x + w + gapPx, y + h + gapPx, gapPx, gapPx);
        // non-interactive handles
        ctx.fillStyle = 'gray';
        // -> top left handle
        ctx.fillRect(x - handlePx, y - handlePx, gapPx, gapPx);
        // -> top right handle
        ctx.fillRect(x + w + gapPx, y - handlePx, gapPx, gapPx);
        // -> bottom left handle
        ctx.fillRect(x - handlePx, y + h + gapPx, gapPx, gapPx);
        return {
            w:  w,
            h: h
        };
    }
});

})();
