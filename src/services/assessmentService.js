import diagnosticMock from '@/data/diagnostic.mock.json';
import submitMock from '@/data/submit.mock.json';
import { getApiUrl, USE_MOCK } from '@/config/api';

const delay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getQuestions() {
  if (USE_MOCK) {
    await delay(400);
    return { ...diagnosticMock };
  }

  const response = await fetch(getApiUrl('/assessment/questions'), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error('Failed to fetch questions');
  return response.json();
}

export async function submitAssessment(payload) {
  if (USE_MOCK) {
    await delay(600);
    // Return a copy with a unique assessment_id per call
    return {
      ...submitMock,
      assessment_id: `mock-assess-${Date.now()}`,
    };
  }

  const response = await fetch(getApiUrl('/assessment/submit'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('Failed to submit assessment');
  return response.json();
}

export async function getStatus(studentId) {
  if (USE_MOCK) {
    await delay(200);
    return { diagnostic_taken: false, taken_at: null, assessment_id: null };
  }

  const response = await fetch(getApiUrl(`/assessment/status/${studentId}`), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error('Failed to get status');
  return response.json();
}