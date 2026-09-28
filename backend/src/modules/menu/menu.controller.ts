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
  Query,
} from '@nestjs/common';
import {
  type AddOn,
  type CreateAddOnRequest,
  createAddOnRequestSchema,
  type CreateMenuCategoryRequest,
  createMenuCategoryRequestSchema,
  type CreateMenuItemRequest,
  createMenuItemRequestSchema,
  type CreateVariationRequest,
  createVariationRequestSchema,
  type ItemAvailabilityRequest,
  itemAvailabilityRequestSchema,
  type MenuCategory,
  type MenuItem,
  type MenuItemListQuery,
  menuItemListQuerySchema,
  type UpdateAddOnRequest,
  updateAddOnRequestSchema,
  type UpdateMenuCategoryRequest,
  updateMenuCategoryRequestSchema,
  type UpdateMenuItemRequest,
  updateMenuItemRequestSchema,
  type UpdateVariationRequest,
  updateVariationRequestSchema,
  type Variation,
} from '@quickbite/validation';
import { Roles } from '../../common/auth/auth.decorators';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import {
  CurrentRestaurant,
  type RestaurantAccess,
  RestaurantMember,
  RestaurantOwnerOnly,
} from '../restaurants/restaurant-access';
import { MenuService } from './menu.service';

/**
 * /api/v1/restaurant/menu — API_SPEC §50. Owners manage the menu; operators read it and toggle
 * item availability (AUTH_AUTHORIZATION §42–43).
 */
@Controller('restaurant/menu')
@Roles('RESTAURANT_OWNER', 'RESTAURANT_OPERATOR')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  // ---------------------------------------------------------------- categories

  @Get('categories')
  @RestaurantMember()
  listCategories(@CurrentRestaurant() access: RestaurantAccess): Promise<MenuCategory[]> {
    return this.menu.listCategories(access.restaurantId);
  }

  @Post('categories')
  @RestaurantOwnerOnly()
  createCategory(
    @CurrentRestaurant() access: RestaurantAccess,
    @Body(new ZodValidationPipe(createMenuCategoryRequestSchema)) body: CreateMenuCategoryRequest,
  ): Promise<MenuCategory> {
    return this.menu.createCategory(access.restaurantId, body);
  }

  @Patch('categories/:categoryId')
  @RestaurantOwnerOnly()
  updateCategory(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body(new ZodValidationPipe(updateMenuCategoryRequestSchema)) body: UpdateMenuCategoryRequest,
  ): Promise<MenuCategory> {
    return this.menu.updateCategory(access.restaurantId, categoryId, body);
  }

  @Delete('categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RestaurantOwnerOnly()
  deleteCategory(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ): Promise<void> {
    return this.menu.deleteCategory(access.restaurantId, categoryId);
  }

  // ---------------------------------------------------------------- items

  @Get('items')
  @RestaurantMember()
  listItems(
    @CurrentRestaurant() access: RestaurantAccess,
    @Query(new ZodValidationPipe(menuItemListQuerySchema)) query: MenuItemListQuery,
  ): Promise<MenuItem[]> {
    return this.menu.listItems(access.restaurantId, query.categoryId);
  }

  @Post('items')
  @RestaurantOwnerOnly()
  createItem(
    @CurrentRestaurant() access: RestaurantAccess,
    @Body(new ZodValidationPipe(createMenuItemRequestSchema)) body: CreateMenuItemRequest,
  ): Promise<MenuItem> {
    return this.menu.createItem(access.restaurantId, body);
  }

  @Get('items/:itemId')
  @RestaurantMember()
  getItem(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<MenuItem> {
    return this.menu.getItem(access.restaurantId, itemId);
  }

  @Patch('items/:itemId')
  @RestaurantOwnerOnly()
  updateItem(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(updateMenuItemRequestSchema)) body: UpdateMenuItemRequest,
  ): Promise<MenuItem> {
    return this.menu.updateItem(access.restaurantId, itemId, body);
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RestaurantOwnerOnly()
  deleteItem(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    return this.menu.deleteItem(access.restaurantId, itemId);
  }

  @Post('items/:itemId/availability')
  @HttpCode(HttpStatus.OK)
  @RestaurantMember()
  setAvailability(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(itemAvailabilityRequestSchema)) body: ItemAvailabilityRequest,
  ): Promise<MenuItem> {
    return this.menu.setAvailability(access.restaurantId, itemId, body.available);
  }

  // ---------------------------------------------------------------- variations

  @Get('items/:itemId/variations')
  @RestaurantMember()
  listVariations(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<Variation[]> {
    return this.menu.listVariations(access.restaurantId, itemId);
  }

  @Post('items/:itemId/variations')
  @RestaurantOwnerOnly()
  createVariation(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(createVariationRequestSchema)) body: CreateVariationRequest,
  ): Promise<Variation> {
    return this.menu.createVariation(access.restaurantId, itemId, body);
  }

  @Patch('variations/:variationId')
  @RestaurantOwnerOnly()
  updateVariation(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('variationId', ParseUUIDPipe) variationId: string,
    @Body(new ZodValidationPipe(updateVariationRequestSchema)) body: UpdateVariationRequest,
  ): Promise<Variation> {
    return this.menu.updateVariation(access.restaurantId, variationId, body);
  }

  @Delete('variations/:variationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RestaurantOwnerOnly()
  deleteVariation(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('variationId', ParseUUIDPipe) variationId: string,
  ): Promise<void> {
    return this.menu.deleteVariation(access.restaurantId, variationId);
  }

  // ---------------------------------------------------------------- add-ons

  @Get('items/:itemId/add-ons')
  @RestaurantMember()
  listAddOns(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<AddOn[]> {
    return this.menu.listAddOns(access.restaurantId, itemId);
  }

  @Post('items/:itemId/add-ons')
  @RestaurantOwnerOnly()
  createAddOn(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(createAddOnRequestSchema)) body: CreateAddOnRequest,
  ): Promise<AddOn> {
    return this.menu.createAddOn(access.restaurantId, itemId, body);
  }

  @Patch('add-ons/:addOnId')
  @RestaurantOwnerOnly()
  updateAddOn(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('addOnId', ParseUUIDPipe) addOnId: string,
    @Body(new ZodValidationPipe(updateAddOnRequestSchema)) body: UpdateAddOnRequest,
  ): Promise<AddOn> {
    return this.menu.updateAddOn(access.restaurantId, addOnId, body);
  }

  @Delete('add-ons/:addOnId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RestaurantOwnerOnly()
  deleteAddOn(
    @CurrentRestaurant() access: RestaurantAccess,
    @Param('addOnId', ParseUUIDPipe) addOnId: string,
  ): Promise<void> {
    return this.menu.deleteAddOn(access.restaurantId, addOnId);
  }
}
