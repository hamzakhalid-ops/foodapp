import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  type LocationQuery,
  locationQuerySchema,
  type PublicMenu,
  type RestaurantDetails,
  type RestaurantListQuery,
  restaurantListQuerySchema,
  type RestaurantSummary,
  type SearchQuery,
  searchQuerySchema,
  type SearchResult,
} from '@quickbite/validation';
import { Public } from '../../common/auth/auth.decorators';
import { type ApiPage } from '../../common/http/api-response.interceptor';
import { offsetPage } from '../../common/http/pagination';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { DiscoveryService } from './discovery.service';

/** Public customer discovery — API_SPEC §28–31. */
@Controller()
@Public()
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('restaurants')
  async list(
    @Query(new ZodValidationPipe(restaurantListQuerySchema)) query: RestaurantListQuery,
  ): Promise<ApiPage<RestaurantSummary>> {
    const { rows, total } = await this.discovery.list(query);
    return offsetPage(rows, total, query.page, query.pageSize);
  }

  @Get('restaurants/:restaurantId')
  details(
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
    @Query(new ZodValidationPipe(locationQuerySchema)) query: LocationQuery,
  ): Promise<RestaurantDetails> {
    return this.discovery.details(restaurantId, query);
  }

  @Get('restaurants/:restaurantId/menu')
  menu(@Param('restaurantId', ParseUUIDPipe) restaurantId: string): Promise<PublicMenu> {
    return this.discovery.menu(restaurantId);
  }

  @Get('search')
  search(
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQuery,
  ): Promise<SearchResult> {
    return this.discovery.search(query);
  }
}
