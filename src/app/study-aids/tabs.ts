import {StudyAids} from './study-aids.model';

export type StudyTab = 'summary' | 'transcript' | 'quiz';

export const TAB_LABELS: Record<StudyTab, string> = {
    summary: 'Summary',
    transcript: 'Transcription',
    quiz: 'Quiz',
};

/** The tabs with something in them for this reader: editors also get the ones they can fill. */
export function studyTabs(aids: StudyAids): StudyTab[] {
    const tabs: StudyTab[] = [];
    if (aids.summary || aids.can_edit || aids.generation === 'pending') {
        tabs.push('summary');
    }
    if (aids.has_transcript) {
        tabs.push('transcript');
    }
    if (aids.quiz?.questions.length || aids.can_edit || (aids.generation === 'pending' && !aids.quiz)) {
        tabs.push('quiz');
    }

    return tabs;
}

export function isStudyTab(value: unknown): value is StudyTab {
    return value === 'summary' || value === 'transcript' || value === 'quiz';
}
