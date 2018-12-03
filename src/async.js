"use strict";
var firstLineError;
try {throw new Error(); } catch (e) {firstLineError = e;}
var ASSERT = require("./assert");
var schedule = require("./schedule");
var Queue = require("./queue");
var util = require("./util");

function Async() {
    this._customScheduler = false;
    this._isTickUsed = false;
    this._lateQueue = new Queue(LATE_QUEUE_CAPACITY);
    this._normalQueue = new Queue(NORMAL_QUEUE_CAPACITY);
    this._haveDrainedQueues = false;
    this._trampolineEnabled = true;
    var self = this;
    this.drainQueues = function () {
        self._drainQueues(self._batchSize);
    };
    this._customSetTimeout = undefined;
    this._schedule = schedule;

    // by default set to large enough
    // number that no batching would happen
    // Number.MAX_SAFE_INTEGER would have been more
    // appropriate but it isnt available for IE.
    this._batchSize = Math.pow(2, 32) - 1;
}

Async.prototype.setScheduler = function(fn) {
    var prev = this._schedule;
    this._schedule = fn;
    this._customScheduler = true;
    return prev;
};

// set the batchsize for processing queue
Async.prototype.setBatchSize = function(batchSize) {
    ASSERT(batchSize > 0);
    this._batchSize = batchSize;
};

Async.prototype.setTimeoutScheduler = function(setTimeoutFn) {
    var prev = this._customSetTimeout;
    this._customSetTimeout = setTimeoutFn;
    return prev;
};

// returns built-in timeout function, or custom one if set.
Async.prototype.getTimeoutFn = function () {
    return this._customSetTimeout || setTimeout;
};

Async.prototype.hasCustomScheduler = function() {
    return this._customScheduler;
};

Async.prototype.enableTrampoline = function() {
    this._trampolineEnabled = true;
};

Async.prototype.disableTrampolineIfNecessary = function() {
    if (util.hasDevTools) {
        this._trampolineEnabled = false;
    }
};

Async.prototype.haveItemsQueued = function () {
    return this._isTickUsed || this._haveDrainedQueues;
};


Async.prototype.fatalError = function(e, isNode) {
    if (isNode) {
        process.stderr.write("Fatal " + (e instanceof Error ? e.stack : e) +
            "\n");
        process.exit(2);
    } else {
        this.throwLater(e);
    }
};

// Must be used if fn can throw
Async.prototype.throwLater = function(fn, arg) {
    if (arguments.length === 1) {
        arg = fn;
        fn = function () { throw arg; };
    }
    var setTimeout = this.getTimeoutFn();
    if (typeof setTimeout !== "undefined") {
        setTimeout(function() {
            fn(arg);
        }, 0);
    } else try {
        this._schedule(function() {
            fn(arg);
        });
    } catch (e) {
        throw new Error(NO_ASYNC_SCHEDULER);
    }
};

//When the fn absolutely needs to be called after
//the queue has been completely flushed
function AsyncInvokeLater(fn, receiver, arg) {
    ASSERT(arguments.length === 3);
    this._lateQueue.push(fn, receiver, arg);
    this._queueTick();
}

function AsyncInvoke(fn, receiver, arg) {
    ASSERT(arguments.length === 3);
    this._normalQueue.push(fn, receiver, arg);
    this._queueTick();
}

function AsyncSettlePromises(promise) {
    this._normalQueue._pushOne(promise);
    this._queueTick();
}

if (!util.hasDevTools) {
    Async.prototype.invokeLater = AsyncInvokeLater;
    Async.prototype.invoke = AsyncInvoke;
    Async.prototype.settlePromises = AsyncSettlePromises;
} else {
    Async.prototype.invokeLater = function (fn, receiver, arg) {
        if (this._trampolineEnabled) {
            AsyncInvokeLater.call(this, fn, receiver, arg);
        } else {
            var setTimeout = this.getTimeoutFn();
            this._schedule(function() {
                setTimeout(function() {
                    fn.call(receiver, arg);
                }, 100);
            });
        }
    };

    Async.prototype.invoke = function (fn, receiver, arg) {
        if (this._trampolineEnabled) {
            AsyncInvoke.call(this, fn, receiver, arg);
        } else {
            this._schedule(function() {
                fn.call(receiver, arg);
            });
        }
    };

    Async.prototype.settlePromises = function(promise) {
        if (this._trampolineEnabled) {
            AsyncSettlePromises.call(this, promise);
        } else {
            this._schedule(function() {
                promise._settlePromises();
            });
        }
    };
}

Async.prototype.invokeFirst = function (fn, receiver, arg) {
    ASSERT(arguments.length === 3);
    this._normalQueue.unshift(fn, receiver, arg);
    this._queueTick();
};

Async.prototype._drainQueue = function(queue, itemsToProcess) {
    ASSERT(itemsToProcess >= 0);
    while (queue.length() > 0) {

        if (itemsToProcess === 0) {
            // can not process any more items
            // in this frame.
            break;
        }

        var fn = queue.shift();
        if (typeof fn !== "function") {
            fn._settlePromises();
            continue;
        }
        var receiver = queue.shift();
        var arg = queue.shift();
        fn.call(receiver, arg);
        itemsToProcess--;
    }

    return itemsToProcess;
};

Async.prototype._drainQueues = function (itemsToProcess) {
    ASSERT(this._isTickUsed);
    itemsToProcess = this._drainQueue(this._normalQueue, itemsToProcess);
    this._reset();
    this._haveDrainedQueues = true;
    this._drainQueue(this._lateQueue, itemsToProcess);

    if (this._normalQueue.length() > 0 || this._lateQueue.length() > 0) {
        // couldn't drain the queue this time
        // schedule nother drain.
        this._queueTick();
    }
};

Async.prototype._queueTick = function () {
    if (!this._isTickUsed) {
        this._isTickUsed = true;
        this._schedule(this.drainQueues);
    }
};

Async.prototype._reset = function () {
    this._isTickUsed = false;
};

module.exports = Async;
module.exports.firstLineError = firstLineError;
