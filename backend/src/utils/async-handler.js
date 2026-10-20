'use strict';

function asyncHandler(handler) {
  return function handledRequest(request, response, next) {
    return Promise.resolve(handler(request, response, next)).catch(next);
  };
}

module.exports = {
  asyncHandler,
};
