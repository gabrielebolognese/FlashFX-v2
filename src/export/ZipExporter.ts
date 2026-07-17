import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export class ZipExporter {
  async createAndDownloadZip(
    files: { name: string; blob: Blob }[],
    zipFileName: string
  ): Promise<void> {
    if (files.length === 0) {
      throw new Error('No files to zip');
    }

    const zip = new JSZip();

    for (const file of files) {
      zip.file(file.name, file.blob);
    }

    try {
      const content = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6
        }
      });

      saveAs(content, zipFileName);
    } catch (error) {
      console.error('ZIP creation failed:', error);
      throw new Error('Failed to create ZIP file');
    }
  }

  async createZipBlob(files: { name: string; blob: Blob }[]): Promise<Blob> {
    if (files.length === 0) {
      throw new Error('No files to zip');
    }

    const zip = new JSZip();

    for (const file of files) {
      zip.file(file.name, file.blob);
    }

    return zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6
      }
    });
  }
}
