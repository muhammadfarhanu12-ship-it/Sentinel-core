export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const maybeAxios = error as {
      message?: string;
      response?: {
        data?: {
          detail?: string;
          error?: {
            message?: string;
          };
        };
      };
    };

    return (
      maybeAxios.response?.data?.error?.message ||
      maybeAxios.response?.data?.detail ||
      maybeAxios.message ||
      fallback
    );
  }

  return fallback;
}
