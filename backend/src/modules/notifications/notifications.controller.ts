import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  type NotificationListQuery,
  notificationListQuerySchema,
  type NotificationPreferenceView,
  type NotificationView,
  type RegisterDeviceRequest,
  registerDeviceRequestSchema,
  type UpdateNotificationPreferencesRequest,
  updateNotificationPreferencesRequestSchema,
} from '@quickbite/validation';
import { type AuthContext, CurrentAuth } from '../../common/auth/auth.decorators';
import { ApiPage } from '../../common/http/api-response.interceptor';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

/** /api/v1/notifications — API_SPEC §90–91; every user sees only their own notifications. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(notificationListQuerySchema)) query: NotificationListQuery,
  ): Promise<ApiPage<NotificationView>> {
    const { rows, nextCursor, unread } = await this.notifications.list(auth.userId, query);
    return new ApiPage(rows, {
      pagination: { limit: query.limit, nextCursor, hasMore: nextCursor !== null },
      unreadCount: unread,
    });
  }

  @Get('preferences')
  preferences(@CurrentAuth() auth: AuthContext): Promise<NotificationPreferenceView[]> {
    return this.notifications.preferences(auth.userId);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(updateNotificationPreferencesRequestSchema))
    body: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferenceView[]> {
    return this.notifications.updatePreferences(auth.userId, body.preferences);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  readAll(@CurrentAuth() auth: AuthContext): Promise<{ updated: number }> {
    return this.notifications.markAllRead(auth.userId);
  }

  @Put('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  registerDevice(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(registerDeviceRequestSchema)) body: RegisterDeviceRequest,
  ): Promise<void> {
    return this.notifications.registerDevice(auth.userId, body);
  }

  @Delete('devices/:deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unregisterDevice(
    @CurrentAuth() auth: AuthContext,
    @Param('deviceId') deviceId: string,
  ): Promise<void> {
    return this.notifications.unregisterDevice(auth.userId, deviceId.slice(0, 128));
  }

  @Get(':notificationId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ): Promise<NotificationView> {
    return this.notifications.get(auth.userId, notificationId);
  }

  @Post(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  read(
    @CurrentAuth() auth: AuthContext,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ): Promise<NotificationView> {
    return this.notifications.markRead(auth.userId, notificationId);
  }
}
