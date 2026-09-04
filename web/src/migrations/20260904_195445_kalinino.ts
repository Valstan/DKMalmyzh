import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_institutions_theme" AS ENUM('kalinino');
  CREATE TYPE "public"."enum__institutions_v_version_theme" AS ENUM('kalinino');
  CREATE TABLE "posts_videos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"url" varchar
  );
  
  CREATE TABLE "_posts_v_version_videos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"url" varchar,
  	"_uuid" varchar
  );
  
  ALTER TABLE "institutions" ADD COLUMN "theme" "enum_institutions_theme";
  ALTER TABLE "_institutions_v" ADD COLUMN "version_theme" "enum__institutions_v_version_theme";
  ALTER TABLE "posts" ADD COLUMN "source_url" varchar;
  ALTER TABLE "_posts_v" ADD COLUMN "version_source_url" varchar;
  ALTER TABLE "posts_videos" ADD CONSTRAINT "posts_videos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_version_videos" ADD CONSTRAINT "_posts_v_version_videos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_videos_order_idx" ON "posts_videos" USING btree ("_order");
  CREATE INDEX "posts_videos_parent_id_idx" ON "posts_videos" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_version_videos_order_idx" ON "_posts_v_version_videos" USING btree ("_order");
  CREATE INDEX "_posts_v_version_videos_parent_id_idx" ON "_posts_v_version_videos" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "posts_videos" CASCADE;
  DROP TABLE "_posts_v_version_videos" CASCADE;
  ALTER TABLE "institutions" DROP COLUMN "theme";
  ALTER TABLE "_institutions_v" DROP COLUMN "version_theme";
  ALTER TABLE "posts" DROP COLUMN "source_url";
  ALTER TABLE "_posts_v" DROP COLUMN "version_source_url";
  DROP TYPE "public"."enum_institutions_theme";
  DROP TYPE "public"."enum__institutions_v_version_theme";`)
}
