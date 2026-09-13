# Proxy meal images through the backend

Meal image uploads and deletions pass through the backend so authentication and EXIF stripping are guaranteed server-side, viewing uses short-lived signed GET URLs, and a failed upload never blocks saving the Meal Observation, which can be saved without the image and have one attached later. We chose backend proxying over presigned browser uploads because privacy sanitization must not depend on client behavior, and non-blocking failure mirrors the rule that model failures never block logging.
