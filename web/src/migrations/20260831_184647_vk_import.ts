import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_posts_source" AS ENUM('manual', 'vk');
  CREATE TYPE "public"."enum__posts_v_version_source" AS ENUM('manual', 'vk');
  CREATE TABLE "posts_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer
  );
  
  CREATE TABLE "_posts_v_version_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"_uuid" varchar
  );
  
  ALTER TABLE "institutions" RENAME COLUMN "vk_group_id" TO "vk_owner_id";
  ALTER TABLE "_institutions_v" RENAME COLUMN "version_vk_group_id" TO "version_vk_owner_id";
  ALTER TABLE "posts" ADD COLUMN "vk_uid" varchar;
  ALTER TABLE "posts" ADD COLUMN "source" "enum_posts_source" DEFAULT 'manual';
  ALTER TABLE "_posts_v" ADD COLUMN "version_vk_uid" varchar;
  ALTER TABLE "_posts_v" ADD COLUMN "version_source" "enum__posts_v_version_source" DEFAULT 'manual';
  ALTER TABLE "posts_gallery" ADD CONSTRAINT "posts_gallery_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_gallery" ADD CONSTRAINT "posts_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_version_gallery" ADD CONSTRAINT "_posts_v_version_gallery_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_version_gallery" ADD CONSTRAINT "_posts_v_version_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_gallery_order_idx" ON "posts_gallery" USING btree ("_order");
  CREATE INDEX "posts_gallery_parent_id_idx" ON "posts_gallery" USING btree ("_parent_id");
  CREATE INDEX "posts_gallery_image_idx" ON "posts_gallery" USING btree ("image_id");
  CREATE INDEX "_posts_v_version_gallery_order_idx" ON "_posts_v_version_gallery" USING btree ("_order");
  CREATE INDEX "_posts_v_version_gallery_parent_id_idx" ON "_posts_v_version_gallery" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_version_gallery_image_idx" ON "_posts_v_version_gallery" USING btree ("image_id");
  CREATE UNIQUE INDEX "posts_vk_uid_idx" ON "posts" USING btree ("vk_uid");
  CREATE INDEX "_posts_v_version_version_vk_uid_idx" ON "_posts_v" USING btree ("version_vk_uid");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts_gallery" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_version_gallery" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "posts_gallery" CASCADE;
  DROP TABLE "_posts_v_version_gallery" CASCADE;
  ALTER TABLE "institutions" RENAME COLUMN "vk_owner_id" TO "vk_group_id";
  ALTER TABLE "_institutions_v" RENAME COLUMN "version_vk_owner_id" TO "version_vk_group_id";
  DROP INDEX "posts_vk_uid_idx";
  DROP INDEX "_posts_v_version_version_vk_uid_idx";
  ALTER TABLE "posts" DROP COLUMN "vk_uid";
  ALTER TABLE "posts" DROP COLUMN "source";
  ALTER TABLE "_posts_v" DROP COLUMN "version_vk_uid";
  ALTER TABLE "_posts_v" DROP COLUMN "version_source";
  DROP TYPE "public"."enum_posts_source";
  DROP TYPE "public"."enum__posts_v_version_source";`)
}
