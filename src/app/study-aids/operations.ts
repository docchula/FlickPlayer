/*
 * The GraphQL operations the study aids use. Field names follow FlickMan's schema, which keeps the
 * names of the old REST answers. Variables a person types are nullable, so a blank one comes back
 * as a validation message rather than a GraphQL type error.
 */

const PART = 'revision origin edited contributors { name } updated_at verified { revision by { name } at }';
const SUMMARY = `markdown ${PART}`;
const QUIZ = `questions { id prompt choices answer explanation time stats { answered correct } mine } ${PART}`;
const AUTHOR = 'revision author { key name } created_at';
const EDITOR = 'email name role added_at';
const DISPLAY_NAME = 'name changed_at next_change_at';

export interface Operation {
    name: string;
    query: string;
}

function operation(name: string, query: string): Operation {
    return {name, query: query.replace(/\s+/g, ' ').trim()};
}

export const STUDY_AIDS = operation('StudyAids', `query StudyAids($id: ID!) {
    video(id: $id) {
        has_transcript
        studyAids { video_id can_edit can_manage generation summary { ${SUMMARY} } quiz { ${QUIZ} } }
    }
}`);

export const SUMMARY_REVISIONS = operation('StudySummaryRevisions', `query StudySummaryRevisions($id: ID!) {
    video(id: $id) { studyAids { summary { revisions { ${AUTHOR} markdown } } } }
}`);

export const QUIZ_REVISIONS = operation('StudyQuizRevisions', `query StudyQuizRevisions($id: ID!) {
    video(id: $id) { studyAids { quiz { revisions { ${AUTHOR} questions { id prompt choices answer explanation time } } } } }
}`);

export const TRANSCRIPT = operation('LectureTranscript', `query LectureTranscript($id: ID!) {
    video(id: $id) { transcript { paragraphs { time text } } }
}`);

export const SAVE_SUMMARY = operation('SaveStudySummary', `mutation SaveStudySummary($video_id: ID!, $markdown: String, $revision: Int!, $credit: Boolean!) {
    saveStudySummary(video_id: $video_id, markdown: $markdown, revision: $revision, credit: $credit) { outcome summary { ${SUMMARY} } }
}`);

export const SAVE_QUIZ = operation('SaveStudyQuiz', `mutation SaveStudyQuiz($video_id: ID!, $questions: [StudyQuestionInput!]!, $revision: Int!, $credit: Boolean!) {
    saveStudyQuiz(video_id: $video_id, questions: $questions, revision: $revision, credit: $credit) { outcome quiz { ${QUIZ} } }
}`);

export const VERIFY_SUMMARY = operation('VerifyStudySummary', `mutation VerifyStudySummary($video_id: ID!, $revision: Int!, $verified: Boolean!) {
    verifyStudySummary(video_id: $video_id, revision: $revision, verified: $verified) { outcome summary { ${SUMMARY} } }
}`);

export const VERIFY_QUIZ = operation('VerifyStudyQuiz', `mutation VerifyStudyQuiz($video_id: ID!, $revision: Int!, $verified: Boolean!) {
    verifyStudyQuiz(video_id: $video_id, revision: $revision, verified: $verified) { outcome quiz { ${QUIZ} } }
}`);

export const ANSWER = operation('AnswerStudyQuestion', `mutation AnswerStudyQuestion($video_id: ID!, $question_id: ID!, $choice: Int!) {
    answerStudyQuestion(video_id: $video_id, question_id: $question_id, choice: $choice) { answered correct }
}`);

export const UPLOAD_IMAGE = operation('UploadStudyAidImage', `mutation UploadStudyAidImage($video_id: ID!, $image: Upload!) {
    uploadStudyAidImage(video_id: $video_id, image: $image) { url width height }
}`);

export const EDITORS = operation('StudyAidEditors', `query StudyAidEditors { studyAidEditors { ${EDITOR} } }`);

export const GRANT_ROLE = operation('GrantStudyAidRole', `mutation GrantStudyAidRole($email: String, $role: String!) {
    grantStudyAidRole(email: $email, role: $role) { ${EDITOR} }
}`);

export const REMOVE_ROLE = operation('RemoveStudyAidRole', `mutation RemoveStudyAidRole($email: String) {
    removeStudyAidRole(email: $email)
}`);

export const DISPLAY_NAME_QUERY = operation('StudyAidDisplayName', `query StudyAidDisplayName { studyAidDisplayName { ${DISPLAY_NAME} } }`);

export const CHANGE_DISPLAY_NAME = operation('ChangeStudyAidDisplayName', `mutation ChangeStudyAidDisplayName($name: String) {
    changeStudyAidDisplayName(name: $name) { ${DISPLAY_NAME} }
}`);
