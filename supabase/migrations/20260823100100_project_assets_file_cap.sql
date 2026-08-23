/*
# Hard per-file size cap on the project-assets bucket

Server-side backstop for the plan asset limits. The per-plan cap (Free 200 MB) stays enforced
client-side, but this stops anything over the absolute ceiling (Pro's 1 GB max single asset)
regardless of the client. 1 GB = 1073741824 bytes.
*/

update storage.buckets set file_size_limit = 1073741824 where id = 'project-assets';
