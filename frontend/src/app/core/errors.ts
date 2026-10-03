import { HttpErrorResponse } from '@angular/common/http';

/** Extracts a user-facing Norwegian message from an API error. */
export function errorMessage(err: unknown, fallback = 'Noe gikk galt. Prøv igjen.'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Får ikke kontakt med serveren.';
    const body = err.error;
    if (body && typeof body === 'object') {
      if (typeof body.error === 'string') return body.error;
      if (body.errors && typeof body.errors === 'object') return 'Sjekk feltene og prøv igjen.';
    }
  }
  return fallback;
}
