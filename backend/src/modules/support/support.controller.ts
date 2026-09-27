import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  adminSupportMessageRequestSchema,
  type AdminSupportTicketListQuery,
  adminSupportTicketListQuerySchema,
  type AdminUpdateSupportTicketRequest,
  adminUpdateSupportTicketRequestSchema,
  type AssignSupportTicketRequest,
  assignSupportTicketRequestSchema,
  type CreateSupportTicketRequest,
  createSupportTicketRequestSchema,
  type ResolveSupportTicketRequest,
  resolveSupportTicketRequestSchema,
  supportMessageRequestSchema,
  type SupportTicket,
  type SupportTicketDetail,
  type SupportTicketListQuery,
  supportTicketListQuerySchema,
} from '@quickbite/validation';
import { AdminOnly, type AuthContext, CurrentAuth, Roles } from '../../common/auth/auth.decorators';
import { type ApiPage } from '../../common/http/api-response.interceptor';
import { cursorPage } from '../../common/http/pagination';
import { ReqMeta, type RequestMeta } from '../../common/http/request-meta';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { type UploadedFile as StoredFile } from '../../infrastructure/storage/file-validation';
import { SupportService } from './support.service';

const UPLOAD_LIMITS = { limits: { fileSize: 25 * 1024 * 1024, files: 1 } };
const messagePipe = new ZodValidationPipe(supportMessageRequestSchema);
const adminMessagePipe = new ZodValidationPipe(adminSupportMessageRequestSchema);

/** /api/v1/support — API_SPEC §92 (customers, restaurant staff, riders). */
@Controller('support/tickets')
@Roles('CUSTOMER', 'RESTAURANT_OWNER', 'RESTAURANT_OPERATOR', 'RIDER')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createSupportTicketRequestSchema)) body: CreateSupportTicketRequest,
  ): Promise<SupportTicketDetail> {
    return this.support.create(auth, body);
  }

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(supportTicketListQuerySchema)) query: SupportTicketListQuery,
  ): Promise<ApiPage<SupportTicket>> {
    const { rows, nextCursor } = await this.support.list(auth, query);
    return cursorPage(rows, query.limit, nextCursor);
  }

  @Get(':ticketId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ): Promise<SupportTicketDetail> {
    return this.support.get(auth, ticketId);
  }

  /** JSON {message} or multipart `message` + optional `file` (PDF/PNG/JPEG). */
  @Post(':ticketId/messages')
  @UseInterceptors(FileInterceptor('file', UPLOAD_LIMITS))
  message(
    @CurrentAuth() auth: AuthContext,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() body: unknown,
    @UploadedFile() file: StoredFile | undefined,
  ): Promise<SupportTicketDetail> {
    const { message } = messagePipe.transform(body);
    return this.support.requesterMessage(auth, ticketId, message, file);
  }

  @Post(':ticketId/close')
  @HttpCode(HttpStatus.OK)
  close(
    @CurrentAuth() auth: AuthContext,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ): Promise<SupportTicketDetail> {
    return this.support.close(auth, ticketId);
  }
}

/** /api/v1/admin/support — API_SPEC §106, SUPPORT_RULES §3 (ADMIN). */
@Controller('admin/support/tickets')
@AdminOnly()
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(adminSupportTicketListQuerySchema))
    query: AdminSupportTicketListQuery,
  ): Promise<ApiPage<SupportTicket>> {
    const { rows, nextCursor } = await this.support.adminList(query);
    return cursorPage(rows, query.limit, nextCursor);
  }

  @Get(':ticketId')
  get(@Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.support.adminGet(ticketId);
  }

  @Patch(':ticketId')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body(new ZodValidationPipe(adminUpdateSupportTicketRequestSchema))
    body: AdminUpdateSupportTicketRequest,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.support.adminUpdate(ticketId, body, auth.userId, meta);
  }

  @Post(':ticketId/assign')
  @HttpCode(HttpStatus.OK)
  assign(
    @CurrentAuth() auth: AuthContext,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body(new ZodValidationPipe(assignSupportTicketRequestSchema)) body: AssignSupportTicketRequest,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.support.assign(ticketId, body.assigneeId, auth.userId, meta);
  }

  @Post(':ticketId/resolve')
  @HttpCode(HttpStatus.OK)
  resolve(
    @CurrentAuth() auth: AuthContext,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body(new ZodValidationPipe(resolveSupportTicketRequestSchema))
    body: ResolveSupportTicketRequest,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.support.resolve(ticketId, auth.userId, body.message, meta);
  }

  /** JSON {message, internal?} or multipart with `internal` = "true" and optional `file`. */
  @Post(':ticketId/messages')
  @UseInterceptors(FileInterceptor('file', UPLOAD_LIMITS))
  message(
    @CurrentAuth() auth: AuthContext,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() body: Record<string, unknown> | undefined,
    @UploadedFile() file: StoredFile | undefined,
    @ReqMeta() meta: RequestMeta,
  ) {
    const raw = body ?? {};
    const parsed = adminMessagePipe.transform({
      ...raw,
      ...(typeof raw.internal === 'string' ? { internal: raw.internal === 'true' } : {}),
    });
    return this.support.adminMessage(
      ticketId,
      auth.userId,
      parsed.message,
      parsed.internal,
      file,
      meta,
    );
  }
}
