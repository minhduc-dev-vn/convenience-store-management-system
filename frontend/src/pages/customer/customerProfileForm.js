import { getErrorMessage } from '../../api/errors.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CUSTOMER_PROFILE_SUCCESS_MESSAGE = 'Hồ sơ cá nhân đã được cập nhật.';

const FIELD_MESSAGES = Object.freeze({
  addressTooLong: 'Địa chỉ không được vượt quá 255 ký tự.',
  duplicateEmail: 'Email này đã được sử dụng bởi tài khoản khác.',
  emailInvalid: 'Email không đúng định dạng.',
  emailTooLong: 'Email không được vượt quá 100 ký tự.',
  fullNameRequired: 'Họ và tên không được để trống.',
  fullNameTooLong: 'Họ và tên không được vượt quá 100 ký tự.',
});

export function validateCustomerProfileForm(form) {
  const errors = {};
  const fullName = typeof form.fullName === 'string' ? form.fullName.trim() : '';
  const email = typeof form.email === 'string' ? form.email.trim() : '';
  const address = typeof form.address === 'string' ? form.address.trim() : '';

  if (!fullName) {
    errors.fullName = FIELD_MESSAGES.fullNameRequired;
  } else if (fullName.length > 100) {
    errors.fullName = FIELD_MESSAGES.fullNameTooLong;
  }

  if (email.length > 100) {
    errors.email = FIELD_MESSAGES.emailTooLong;
  } else if (email && !EMAIL_PATTERN.test(email)) {
    errors.email = FIELD_MESSAGES.emailInvalid;
  }

  if (address.length > 255) {
    errors.address = FIELD_MESSAGES.addressTooLong;
  }

  return errors;
}

export function normalizeCustomerProfilePayload(form) {
  const email = form.email.trim();
  const address = form.address.trim();

  return {
    fullName: form.fullName.trim().replace(/\s+/g, ' '),
    email: email ? email.toLowerCase() : null,
    address: address || null,
  };
}

export async function submitCustomerProfileForm(form, updateProfile) {
  const fieldErrors = validateCustomerProfileForm(form);
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, globalError: null, profile: null, successMessage: null };
  }

  try {
    const profile = await updateProfile(normalizeCustomerProfilePayload(form));
    return {
      fieldErrors: {},
      globalError: null,
      profile,
      successMessage: CUSTOMER_PROFILE_SUCCESS_MESSAGE,
    };
  } catch (error) {
    if (error?.code === 'PROFILE_CONFLICT') {
      return {
        fieldErrors: { email: FIELD_MESSAGES.duplicateEmail },
        globalError: null,
        profile: null,
        successMessage: null,
      };
    }

    return {
      fieldErrors: {},
      globalError: getErrorMessage(error),
      profile: null,
      successMessage: null,
    };
  }
}
