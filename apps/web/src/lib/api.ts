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

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('viberoom_token');
      // Optionally trigger a logout event here
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'API Error');
  }

  return response.json();
}
