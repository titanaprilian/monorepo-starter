CREATE TABLE "system" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "system_key_unique" UNIQUE("key")
);
