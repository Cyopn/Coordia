import { Module } from '@nestjs/common';
import { EmailJsProvider } from './emailjs.provider';
import { EmailService } from './email.service';

@Module({
  providers: [EmailJsProvider, EmailService],
  exports: [EmailService],
})
export class EmailModule {}
