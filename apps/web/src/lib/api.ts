const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('viberoom_token');
  
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = `${API_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('viberoom_token');
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API ${response.status}`);
    }

    return response.json();
  } catch (err: any) {
    // Add the URL to the error so we can debug
    if (err.message === 'Load failed' || err.message === 'Failed to fetch') {
      throw new Error(`Cannot reach API (${API_URL})`);
    }
    throw err;
  }
}
