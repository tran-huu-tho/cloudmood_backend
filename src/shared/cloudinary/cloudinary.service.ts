import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class CloudinaryService {
  uploadFile(
    file: Express.Multer.File,
    resourceType: 'image' | 'video' = 'image',
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'cloudmood_forum',
          resource_type: resourceType,
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result)
            return reject(new Error('Cloudinary upload returned no result'));
          resolve(result);
        },
      );

      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }

  uploadBase64Image(
    base64Data: string,
    folder = 'cloudmood_avatars',
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    return cloudinary.uploader.upload(base64Data, {
      folder,
      resource_type: 'image',
    });
  }
}
