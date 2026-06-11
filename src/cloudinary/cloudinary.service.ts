import { Injectable } from "@nestjs/common";
import { v2 as cloudinary } from "cloudinary";
import { Multer } from "multer";

@Injectable()
export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: "avatars" }, (error, result) => {
          if (error) {
            return reject(error);
          }
          if (result && result.secure_url) {
            resolve(result.secure_url);
          } else {
            reject(
              new Error("Cloudinary upload failed: No secure_url returned."),
            );
          }
        })
        .end(file.buffer);
    });
  }


  async uploadFile(
    file: Express.Multer.File,
    folder: string = "resources",
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: folder,
            resource_type: "raw", 
          },
          (error, result) => {
            if (error) return reject(error);
            if (result && result.secure_url) {
              resolve(result.secure_url);
            } else {
              reject(new Error("Cloudinary upload failed: No secure_url returned."));
            }
          },
        )
        .end(file.buffer);
    });
  }
}
