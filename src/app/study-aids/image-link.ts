import {InjectionToken} from '@angular/core';
import {AlertController} from '@ionic/angular';
import {canShowDriveImage, driveFileId, imageMarkdown} from './images';

/** Whether readers can see a Drive picture. A token, so that tests need not reach Google. */
export const DRIVE_IMAGE_CHECK = new InjectionToken<(id: string) => Promise<boolean>>('DriveImageCheck', {
    providedIn: 'root',
    factory: () => canShowDriveImage,
});

export interface DriveImageChoice {
    id: string;
    description: string;
}

/** Asks the editor for a Google Drive link to a picture; null when they cancel. Throws the message to show for a link that is not one. */
export async function askForDriveImage(alertCtrl: AlertController): Promise<DriveImageChoice | null> {
    const alert = await alertCtrl.create({
        header: 'Add an image from Google Drive',
        message: 'Put the picture in your Google Drive, share it as "Anyone with the link", then paste its link here.',
        inputs: [
            {name: 'link', type: 'url', placeholder: 'https://drive.google.com/file/d/…'},
            {name: 'description', type: 'text', placeholder: 'What it shows (optional)'},
        ],
        buttons: [
            {text: 'Cancel', role: 'cancel'},
            {text: 'Add', role: 'confirm'},
        ],
    });
    await alert.present();
    const {role, data} = await alert.onDidDismiss<{values?: {link?: string; description?: string}}>();
    if (role !== 'confirm') {
        return null;
    }
    const id = driveFileId(data?.values?.link ?? '');
    if (!id) {
        throw new Error('That is not a Google Drive link. In Drive, choose Share, then Copy link, and paste it here.');
    }

    return {id, description: data?.values?.description ?? ''};
}

/** The Markdown for a chosen picture, once it is clear readers can see it. Throws the message to show when they cannot. */
export async function driveImageMarkdown(choice: DriveImageChoice, canShow: (id: string) => Promise<boolean>): Promise<string> {
    if (!(await canShow(choice.id))) {
        throw new Error('Readers would not see that picture. In Google Drive, share it as "Anyone with the link", then add it again.');
    }

    return imageMarkdown(choice.id, choice.description);
}
