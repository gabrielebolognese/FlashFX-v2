// Decode a user image blob/file to an ImageBitmap that ALWAYS honors EXIF orientation. Phone photos
// store their pixels in one orientation plus an EXIF flag ("rotate 90 for display"); createImageBitmap
// defaults to NOT applying that flag on every engine, so without `imageOrientation: 'from-image'` a
// portrait photo decodes sideways AND the width/height it reports can disagree with the pixels, which
// renders rotated and stretched (very visible in a 9:16 short-form canvas). Routing every SOURCE-image
// decode through here keeps the canvas render and the image-tool modals consistently oriented.
//
// Only for decoding ORIGINAL image files. Re-encoding a canvas or a VideoFrame to a bitmap must NOT
// use this (those carry no EXIF and 'from-image' is a needless cost).
export function decodeImageBitmap(src: Blob, extra?: ImageBitmapOptions): Promise<ImageBitmap> {
  return createImageBitmap(src, { imageOrientation: 'from-image', ...extra });
}
