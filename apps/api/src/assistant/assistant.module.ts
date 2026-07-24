import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { OllamaAssistantClient } from './ollama-client';

@Module({
  imports: [AuthModule],
  controllers: [AssistantController],
  providers: [AssistantService, OllamaAssistantClient],
})
export class AssistantModule {}
