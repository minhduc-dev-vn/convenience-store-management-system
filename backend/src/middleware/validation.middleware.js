'use strict';

const { validationError } = require('../utils/input-validation');

function validateBody({ required = [], optional = [], atLeastOne = [] }) {
  const allowedFields = new Set([...required, ...optional]);

  return function bodyValidator(request, _response, next) {
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      next(validationError('Request body must be a JSON object'));
      return;
    }

    const unknownFields = Object.keys(body).filter((field) => !allowedFields.has(field));
    if (unknownFields.length > 0) {
      next(validationError(`Unsupported request field: ${unknownFields[0]}`));
      return;
    }

    const missingField = required.find((field) => !Object.hasOwn(body, field));
    if (missingField) {
      next(validationError(`${missingField} is required`));
      return;
    }

    if (atLeastOne.length > 0 && !atLeastOne.some((field) => Object.hasOwn(body, field))) {
      next(validationError(`At least one of these fields is required: ${atLeastOne.join(', ')}`));
      return;
    }

    next();
  };
}

module.exports = {
  validateBody,
};
