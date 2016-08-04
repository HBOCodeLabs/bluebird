"use strict";
var assert = require("assert");
var testUtils = require("./helpers/util.js");
var schedule = require("../../js/debug/schedule");
var isNodeJS = testUtils.isNodeJS;

describe("schedule", function () {
    if (isNodeJS) {
        describe("for Node.js", function () {
            it("should preserve the active domain", function() {
                var domain       = require("domain");
                var activeDomain = domain.create();
                return new Promise(function(resolve) {
                    activeDomain.run(function () {
                        schedule(function () {
                            assert(domain.active);
                            assert.equal(domain.active, activeDomain);
                            resolve();
                        });
                    });
                });

            });
        });

        describe("Promise.setScheduler", function() {
            it("should work with synchronous scheduler", function() {
                var prev = Promise.setScheduler(function(task) {
                    task();
                });
                var success = false;
                Promise.resolve().then(function() {
                    success = true;
                });
                assert(success);
                Promise.setScheduler(prev);
            });
            it("should throw for non function", function() {
                try {
                    Promise.setScheduler({});
                } catch (e) {
                    return Promise.resolve();
                }
                assert.fail();
            });
        });

        describe("Promise.setTimeoutScheduler", function() {
            it("should throw for non function", function() {
                try {
                    Promise.setTimeoutScheduler({});
                } catch (e) {
                    return Promise.resolve();
                }
                assert.fail();
            });
        });

        describe("Promise.setBatchSize", function() {
            it("should throw for non number", function() {
                try {
                    Promise.setBatchSize("foo");
                } catch (e) {
                    return Promise.resolve();
                }
                assert.fail();
            });

            it("should throw for batchsize of zero", function() {
                try {
                    Promise.setBatchSize(0);
                } catch (e) {
                    return Promise.resolve();
                }
                assert.fail();
            });

            it("should throw for negative batchsize", function() {
                try {
                    Promise.setBatchSize(-7);
                } catch (e) {
                    return Promise.resolve();
                }
                assert.fail();
            });

            it("should not throw for positive batchsize", function() {
                try {
                    Promise.setBatchSize(5);
                } catch (e) {
                    assert.fail();
                }
                return Promise.resolve();
            });
        });
    }
});
