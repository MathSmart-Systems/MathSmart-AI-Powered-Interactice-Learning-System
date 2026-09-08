// Simple validation script for Phase 1 service layer
import { getQuestions, submitAssessment, getStatus } from '../src/services/assessmentService.js';

async function test() {
  console.log('Testing assessmentService...');

  // 1. getQuestions
  const questions = await getQuestions();
  console.assert(questions.total_questions === 40, 'total_questions should be 40');
  console.assert(questions.domains.length === 5, 'domains length should be 5');
  questions.domains.forEach((domain, i) => {
    console.assert(domain.questions.length === 8, `domain ${i} should have 8 questions`);
    domain.questions.forEach(q => {
      console.assert(!q.correctAnswer, 'question should not have correctAnswer');
    });
  });
  console.log('✓ getQuestions shape OK');

  // 2. submitAssessment
  const payload = {
    student_id: 'test-student',
    time_taken_minutes: 30,
    answers: questions.domains.flatMap(d => d.questions).map(q => ({
      question_id: q.question_id,
      selected_answer: q.options[0],
    })),
  };
  const result = await submitAssessment(payload);
  console.assert(result.assessment_id, 'assessment_id present');
  console.assert(result.total_score !== undefined, 'total_score present');
  console.assert(result.domain_scores.length === 5, 'domain_scores length 5');
  console.log('✓ submitAssessment shape OK');

  // 3. getStatus
  const status = await getStatus('test-student');
  console.assert(status.diagnostic_taken === false, 'diagnostic_taken false');
  console.log('✓ getStatus shape OK');

  console.log('All Phase 1 service tests passed.');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});