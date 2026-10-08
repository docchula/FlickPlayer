import {firstValueFrom} from 'rxjs';
import {StudyAidsService} from '../study-aids.service';
import {describeFailure} from './failures';
import {imageMarkdown, imageProblem, prepareImage, uploadName} from './images';
import {SaveFailure} from './study-aids.model';

/** Uploads an image an editor picked and returns the Markdown to insert; throws the message to show. */
export async function uploadPickedImage(service: StudyAidsService, videoId: number, file: File): Promise<string> {
    const problem = imageProblem(file);
    if (problem) {
        throw new Error(problem);
    }
    let image: Blob | null;
    try {
        image = await prepareImage(file);
    } catch {
        throw new Error('This image could not be read. Try saving it as PNG or JPEG first.');
    }
    if (!image) {
        throw new Error('This image is too large to upload, even made smaller.');
    }
    try {
        const uploaded = await firstValueFrom(service.uploadImage(videoId, image, uploadName(file, image)));

        return imageMarkdown(uploaded.url, file.name);
    } catch (failure) {
        throw new Error(describeFailure(failure as SaveFailure));
    }
}
