import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { IngestModule } from './ingest/ingest.module';
import { AssistantModule } from './assistant/assistant.module';
import { UsageModule } from './usage/usage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AuthModule,
    IngestModule,
    AssistantModule,
    UsageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
