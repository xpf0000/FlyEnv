"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
exports.__esModule = true;
exports.ForkPromise = void 0;
/**
 * 扩展Promise
 * resolve， reject， on
 * 可以发送中间过程信息了
 */
var ForkPromise = /** @class */ (function () {
    function ForkPromise(executor) {
        var _this = this;
        this.onData = [];
        this.promise = new Promise(function (resolve, reject) {
            _this.res = resolve;
            _this.rej = reject;
            executor(resolve, reject, function () {
                var _a;
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                if (!(_this === null || _this === void 0 ? void 0 : _this._cbOn)) {
                    _this.onData.push(args);
                }
                else {
                    (_a = _this === null || _this === void 0 ? void 0 : _this._cbOn) === null || _a === void 0 ? void 0 : _a.call.apply(_a, __spreadArray([_this], args, false));
                }
            });
        });
    }
    ForkPromise.prototype.then = function (onFulfilled, onrejected) {
        return this.promise.then(onFulfilled, onrejected);
    };
    ForkPromise.prototype["catch"] = function (onrejected) {
        return this.promise["catch"](onrejected);
    };
    ForkPromise.prototype.resolve = function (value) {
        var _a;
        return (_a = this === null || this === void 0 ? void 0 : this.res) === null || _a === void 0 ? void 0 : _a.call(this, value);
    };
    ForkPromise.prototype.reject = function (reason) {
        var _a;
        return (_a = this === null || this === void 0 ? void 0 : this.rej) === null || _a === void 0 ? void 0 : _a.call(this, reason);
    };
    ForkPromise.prototype.on = function (cb) {
        this._cbOn = cb;
        this.onData.forEach(function (d) {
            cb.apply(void 0, d);
        });
        this.onData.splice(0);
        return this;
    };
    return ForkPromise;
}());
exports.ForkPromise = ForkPromise;
