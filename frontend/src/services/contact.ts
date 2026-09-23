import { ApiRequestError, apiRequest } from './api';

export type ContactSubmission = {
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  message: string;
};

const SEND_FAILED_MESSAGE = "We couldn't send your message. Please try again or email support@mefyx.com.";

export async function submitContact(submission: ContactSubmission): Promise<void> {
  const payload = {
    firstName: submission.firstName.trim(),
    lastName: submission.lastName.trim(),
    email: submission.email.trim(),
    company: submission.company?.trim() || '',
    message: submission.message.trim(),
  };

  if (!payload.firstName || !payload.lastName || !payload.email || !payload.message) {
    throw new Error('Please enter your first name, last name, email, and message.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    await apiRequest('/api/v1/contact', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 429) {
      throw new Error('Too many messages. Please wait 15 minutes before trying again.');
    }
    if (error instanceof ApiRequestError && (error.status === 400 || error.status === 422)) {
      throw new Error('Please check your name, email, company, and message and try again.');
    }
    throw new Error(SEND_FAILED_MESSAGE);
  } finally {
    clearTimeout(timeoutId);
  }
}
