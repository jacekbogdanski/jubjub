var { mapObj, curry, pipe, isEqual } = require('./utils')
var { getChange, getField, putError, putChange } = require('./changeset')

/**
 * Allows for validating changeset changes.
 * Each validator has the same signature (opts:Object, changeset:Object) -> changeset:Object.
 * Validators are curried. You can chain validators using pipe or compose
 * from functional style libraries like lodash/fp, ramda.
 * If you pass custom options to the validator, it will be available when traversing errors.
 * @namespace validators
 * @example
 * _.compose(
 *   required({fields: ['title', 'body']}),
 *   length({fields: ['body'], min: 10, max 300}),
 *   acceptance({fields: ['rules']})
 * )(changeset)
 */

module.exports = mapObj(
  {
    /**
     * Validates the given field is present in the changeset.
     * @function required
     * @memberof validators
     * @param opts {Object} - options
     * @param opts.message {String}[can't be blank] - error message
     * @param opts.fields {Array} - fields to validate
     * @param changeset {Object} - target changeset
     * @returns {Object} validated changeset
     */
    required({ fields, message = "can't be blank" }, changeset) {
      var valid = attr =>
        (typeof attr === 'string' && !/^\s*$/.test(attr)) ||
        typeof attr === 'number' ||
        typeof attr === 'boolean' ||
        (typeof attr === 'object' && attr !== null)

      return fields.reduce((changeset, field) => {
        var [ok, value] = getChange(field, changeset)

        if (!ok) {
          ;[ok, value] = getField(field, changeset)
        }

        return valid(value)
          ? changeset
          : pipe(
              putError(field, { message, validation: 'required' }),
              putChange(field, null)
            )(changeset)
      }, changeset)
    },
    /**
     * Validates that the given field has correct length.
     * Works with arrays and strings.
     * When min and max length are equal, validation message will check if length is exactly this value.
     * The messsage of validation failure depends on the validation:
     * for strings:
        `should be ${x} character(s)`,
        `should be at least ${x} character(s)`,
        `should be at most ${x} character(s)`
     * for arrays:
        `should have ${x} items(s)`,
        `should have at least ${x} items(s)`,
        `should have at most ${x} items(s)`
     * @function length
     * @memberof validators
     * @param opts {Object} - options
     * @param opts.message {String} - error message
     * @param opts.fields {Array} - fields to validate
     * @param opts.min {Number} - the length must be greater than or equal to this value
     * @param opts.max {Number} - the length must be less than or equal to this value
     * @param changeset {Object} - target changeset
     * @returns {Object} validated changeset
     */
    length({ message: customMessage, min, max, fields }, changeset) {
      return fields.reduce((changeset, field) => {
        var [ok, value] = getChange(field, changeset)
        if (!ok) return changeset

        var isString = typeof value === 'string'
        if (!(isString || Array.isArray(value)))
          throw `Invalid type of "${field}". Valid types: string, array.`

        var messages = isString
          ? {
              is: x => `should be ${x} character(s)`,
              min: x => `should be at least ${x} character(s)`,
              max: x => `should be at most ${x} character(s)`
            }
          : {
              is: x => `should have ${x} items(s)`,
              min: x => `should have at least ${x} items(s)`,
              max: x => `should have at most ${x} items(s)`
            }

        var length = value.length
        var message

        if (min == max && min == length) message = messages.is(min)
        if (length < min) message = messages.min(min)
        if (length > max) message = messages.max(max)

        if (message)
          return putError(
            field,
            {
              message: customMessage || message,
              validation: 'length',
              min,
              max
            },
            changeset
          )

        return changeset
      }, changeset)
    },
    /**
     * Validates that the given field is true.
     * @function acceptance
     * @memberof validators
     * @param opts {Object} - options
     * @param opts.message {String}[must be accepted] - error message
     * @param opts.fields {Array} - fields to validate
     * @param changeset {Object} - target changeset
     * @returns {Object} validated changeset
     */
    acceptance({ message = 'must be accepted', fields }, changeset) {
      return fields.reduce((changeset, field) => {
        var [ok, value] = getChange(field, changeset)
        if (!ok) return changeset

        if (typeof value !== 'boolean')
          throw `Invalid type of ${field}. Valid types: boolean.`

        if (value) return changeset
        return putError(field, { message, validation: 'acceptance' }, changeset)
      }, changeset)
    },
    /**
     * Use custom validator on values from the given fields. Validator should return Array.
     * If array is not empty, its values will be add to the field errors.
     * @function change
     * @memberof validators
     * @param opts {Object} - options
     * @param opts.fields {Array} - fields to validate
     * @param opts.validator {Function} - custom validator
     * @param changeset {Object} - target changeset
     * @returns {Object} validated changeset
     */
    change({ validator, fields }, changeset) {
      return fields.reduce((changeset, field) => {
        var [ok, value] = getChange(field, changeset)
        if (!ok) return changeset

        return validator(value).reduce(
          (changeset, error) => putError(field, error, changeset),
          changeset
        )
      }, changeset)
    },
    /**
     * Validates that the given field matches the confirmation field.
     * When calling confirmation({fields: ['email']}, changeset), validator will
     * check if both "email" and "emailConfirmation" are equal.
     * @function confirmation
     * @memberof validators
     * @param opts {Object} - options
     * @param opts.message {String}[does not match] - error message
     * @param opts.fields {Array} - fields to validate
     * @param changeset {Object} - target changeset
     * @returns {Object} validated changeset
     */
    confirmation({ message = 'does not match', fields }, changeset) {
      return fields.reduce((changeset, field) => {
        var confirmationField = field + 'Confirmation'

        var [okValue, value] = getChange(field, changeset)
        var [okConfirmation, confirmation] = getChange(
          confirmationField,
          changeset
        )

        if (!okValue && !okConfirmation) return changeset

        if (isEqual(value, confirmation)) return changeset
        return putError(
          field,
          { message, validation: 'confirmation', confirmation },
          changeset
        )
      }, changeset)
    },
    /**
     * Validates that the given field does not match any value from the given reserved values.
     * @function exclusion
     * @memberof validators
     * @param opts {Object} - options
     * @param opts.message {String}[is reserved] - error message
     * @param opts.fields {Array} - fields to validate
     * @param reserved {Array} - reserved values
     * @param changeset {Object} - target changeset
     * @returns {Object} validated changeset
     */
    exclusion({ message = 'is reserved', fields, reserved }, changeset) {
      return fields.reduce((changeset, field) => {
        var [ok, value] = getChange(field, changeset)
        if (!ok) return changeset

        if (!reserved.some(x => x === value)) return changeset

        return putError(
          field,
          { message, validation: 'exclusion', reserved },
          changeset
        )
      }, changeset)
    },
    /**
     * Validates that the given field match any value from the given include values.
     * @function inclusion
     * @memberof validators
     * @param opts {Object} - options
     * @param opts.message {String}[is reserved] - error message
     * @param opts.fields {Array} - fields to validate
     * @param include {Array} - included values
     * @param changeset {Object} - target changeset
     * @returns {Object} validated changeset
     */
    inclusion({ message = 'is invalid', fields, include }, changeset) {
      return fields.reduce((changeset, field) => {
        var [ok, value] = getChange(field, changeset)
        if (!ok) return changeset

        if (include.some(x => x === value)) return changeset

        return putError(
          field,
          { message, validation: 'inclusion', include },
          changeset
        )
      }, changeset)
    },
    /**
     * Validates that the given field match the given format.
     * Works with strings.
     * @function format
     * @memberof validators
     * @param opts {Object} - options
     * @param opts.message {String}[has invalid format] - error message
     * @param opts.fields {Array} - fields to validate
     * @param match {RegEx} - regex to match
     * @param changeset {Object} - target changeset
     * @returns {Object} validated changeset
     */
    format({ message = 'has invalid format', fields, match }, changeset) {
      return fields.reduce((changeset, field) => {
        var [ok, value] = getChange(field, changeset)
        if (!ok) return changeset

        if (typeof value !== 'string')
          throw `Invalid type of ${field}. Valid types: string.`

        if (value.match(match)) return changeset
        return putError(
          field,
          { message, validation: 'format', match },
          changeset
        )
      }, changeset)
    },
    /**
     * Validates that the given field is less than the given number.
     * Works with numbers.
     * @function lessThan
     * @memberof validators
     * @param opts {Object} - options
     * @param opts.message {String}[has invalid format] - error message
     * @param opts.fields {Array} - fields to validate
     * @param number {Number} - number to match
     * @param changeset {Object} - target changeset
     * @returns {Object} validated changeset
     */
    lessThan({ message, number, fields }, changeset) {
      message = message || `must be less than ${number}`
      return fields.reduce((changeset, field) => {
        var [ok, value] = getChange(field, changeset)
        if (!ok) return changeset

        return value < number
          ? changeset
          : putError(
              field,
              { message, validation: 'less than', number },
              changeset
            )
      }, changeset)
    },
    /**
     * Validates that the given field is greater than the given number.
     * Works with numbers.
     * @function greaterThan
     * @memberof validators
     * @param opts {Object} - options
     * @param opts.message {String}[has invalid format] - error message
     * @param opts.fields {Array} - fields to validate
     * @param number {Number} - number to match
     * @param changeset {Object} - target changeset
     * @returns {Object} validated changeset
     */
    greaterThan({ message, number, fields }, changeset) {
      message = message || `must be greater than ${number}`
      return fields.reduce((changeset, field) => {
        var [ok, value] = getChange(field, changeset)
        if (!ok) return changeset

        return value > number
          ? changeset
          : putError(
              field,
              { message, validation: 'greater than', number },
              changeset
            )
      }, changeset)
    },
    /**
     * Validates that the given field is less than or equal to the given number.
     * Works with numbers.
     * @function lessThanOrEqualTo
     * @memberof validators
     * @param opts {Object} - options
     * @param opts.message {String}[has invalid format] - error message
     * @param opts.fields {Array} - fields to validate
     * @param number {Number} - number to match
     * @param changeset {Object} - target changeset
     * @returns {Object} validated changeset
     */
    lessThanOrEqualTo({ message, number, fields }, changeset) {
      message = message || `must be less than or equal to ${number}`
      return fields.reduce((changeset, field) => {
        var [ok, value] = getChange(field, changeset)
        if (!ok) return changeset

        return value <= number
          ? changeset
          : putError(
              field,
              { message, validation: 'less than or equal to', number },
              changeset
            )
      }, changeset)
    },
    /**
     * Validates that the given field is greater than or equal to the given number.
     * Works with numbers.
     * @function greaterThanOrEqualTo
     * @memberof validators
     * @param opts {Object} - options
     * @param opts.message {String}[has invalid format] - error message
     * @param opts.fields {Array} - fields to validate
     * @param number {Number} - number to match
     * @param changeset {Object} - target changeset
     * @returns {Object} validated changeset
     */
    greaterThanOrEqualTo({ message, number, fields }, changeset) {
      message = message || `must be greater than or equal to ${number}`
      return fields.reduce((changeset, field) => {
        var [ok, value] = getChange(field, changeset)
        if (!ok) return changeset

        return value >= number
          ? changeset
          : putError(
              field,
              { message, validation: 'greater than or equal to', number },
              changeset
            )
      }, changeset)
    },
    /**
     * Validates that the given field is equal the given number.
     * Works with numbers.
     * @function equal
     * @memberof validators
     * @param opts {Object} - options
     * @param opts.message {String}[has invalid format] - error message
     * @param opts.fields {Array} - fields to validate
     * @param number {Number} - number to match
     * @param changeset {Object} - target changeset
     * @returns {Object} validated changeset
     */
    equalTo({ message, number, fields }, changeset) {
      message = message || `must be equal to ${number}`
      return fields.reduce((changeset, field) => {
        var [ok, value] = getChange(field, changeset)
        if (!ok) return changeset

        return value == number
          ? changeset
          : putError(
              field,
              { message, validation: 'equal to', number },
              changeset
            )
      }, changeset)
    }
  },
  (key, fn) => curry(fn)
)
