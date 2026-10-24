/*
 * The GraphQL operations the study aids use. Field names follow FlickMan's schema, which keeps the
 * names of the old REST answers.
 */

const QUIZ = 'questions { id prompt choices answer explanation time stats { answered correct } mine }';

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
        studyAids { video_id generation my_ticks summary { markdown } quiz { ${QUIZ} } }
    }
}`);

export const TRANSCRIPT = operation('LectureTranscript', `query LectureTranscript($id: ID!) {
    video(id: $id) { transcript { paragraphs { time text } } }
}`);

export const ANSWER = operation('AnswerStudyQuestion', `mutation AnswerStudyQuestion($video_id: ID!, $question_id: ID!, $choice: Int!) {
    answerStudyQuestion(video_id: $video_id, question_id: $question_id, choice: $choice) { answered correct }
}`);

export const SAVE_TICKS = operation('SaveStudyTicks', `mutation SaveStudyTicks($video_id: ID!, $ticks: [String!]!) {
    saveStudyTicks(video_id: $video_id, ticks: $ticks)
}`);
