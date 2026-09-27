import {
  type AddOn,
  addOnSchema,
  type CreateAddOnRequest,
  type CreateMenuCategoryRequest,
  type CreateMenuItemRequest,
  type CreateVariationRequest,
  type LocationQuery,
  type MenuCategory,
  menuCategorySchema,
  type MenuItem,
  menuItemSchema,
  type PublicMenu,
  publicMenuSchema,
  type RestaurantDetails,
  restaurantDetailsSchema,
  type RestaurantListQuery,
  type RestaurantSummary,
  restaurantSummarySchema,
  type SearchQuery,
  type SearchResult,
  searchResultSchema,
  type UpdateAddOnRequest,
  type UpdateMenuCategoryRequest,
  type UpdateMenuItemRequest,
  type UpdateVariationRequest,
  type Variation,
  variationSchema,
} from '@quickbite/validation';
import { z } from 'zod';
import { type ApiClient, type ApiResult } from './client';

type Query = Record<string, string | number | boolean | undefined>;
const id = (value: string) => encodeURIComponent(value);

/** Restaurant App menu management (docs/api/API_SPEC.md §50). */
export function createMenuApi(client: ApiClient) {
  const get = <T extends z.ZodType>(path: string, schema: T, query?: Query) =>
    client.request({ method: 'GET', path, schema, ...(query ? { query } : {}) });
  const send = <T extends z.ZodType>(
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
    schema: T,
    body?: unknown,
  ) => client.request({ method, path, schema, ...(body === undefined ? {} : { body }) });
  const base = '/restaurant/menu';

  return {
    listCategories: async (): Promise<MenuCategory[]> =>
      (await get(`${base}/categories`, z.array(menuCategorySchema))).data,
    createCategory: async (body: CreateMenuCategoryRequest): Promise<MenuCategory> =>
      (await send('POST', `${base}/categories`, menuCategorySchema, body)).data,
    updateCategory: async (
      categoryId: string,
      body: UpdateMenuCategoryRequest,
    ): Promise<MenuCategory> =>
      (await send('PATCH', `${base}/categories/${id(categoryId)}`, menuCategorySchema, body)).data,
    deleteCategory: async (categoryId: string): Promise<void> => {
      await send('DELETE', `${base}/categories/${id(categoryId)}`, z.null());
    },

    listItems: async (categoryId?: string): Promise<MenuItem[]> =>
      (await get(`${base}/items`, z.array(menuItemSchema), { categoryId })).data,
    getItem: async (itemId: string): Promise<MenuItem> =>
      (await get(`${base}/items/${id(itemId)}`, menuItemSchema)).data,
    createItem: async (body: CreateMenuItemRequest): Promise<MenuItem> =>
      (await send('POST', `${base}/items`, menuItemSchema, body)).data,
    updateItem: async (itemId: string, body: UpdateMenuItemRequest): Promise<MenuItem> =>
      (await send('PATCH', `${base}/items/${id(itemId)}`, menuItemSchema, body)).data,
    deleteItem: async (itemId: string): Promise<void> => {
      await send('DELETE', `${base}/items/${id(itemId)}`, z.null());
    },
    setItemAvailability: async (itemId: string, available: boolean): Promise<MenuItem> =>
      (
        await send('POST', `${base}/items/${id(itemId)}/availability`, menuItemSchema, {
          available,
        })
      ).data,

    listVariations: async (itemId: string): Promise<Variation[]> =>
      (await get(`${base}/items/${id(itemId)}/variations`, z.array(variationSchema))).data,
    createVariation: async (itemId: string, body: CreateVariationRequest): Promise<Variation> =>
      (await send('POST', `${base}/items/${id(itemId)}/variations`, variationSchema, body)).data,
    updateVariation: async (
      variationId: string,
      body: UpdateVariationRequest,
    ): Promise<Variation> =>
      (await send('PATCH', `${base}/variations/${id(variationId)}`, variationSchema, body)).data,
    deleteVariation: async (variationId: string): Promise<void> => {
      await send('DELETE', `${base}/variations/${id(variationId)}`, z.null());
    },

    listAddOns: async (itemId: string): Promise<AddOn[]> =>
      (await get(`${base}/items/${id(itemId)}/add-ons`, z.array(addOnSchema))).data,
    createAddOn: async (itemId: string, body: CreateAddOnRequest): Promise<AddOn> =>
      (await send('POST', `${base}/items/${id(itemId)}/add-ons`, addOnSchema, body)).data,
    updateAddOn: async (addOnId: string, body: UpdateAddOnRequest): Promise<AddOn> =>
      (await send('PATCH', `${base}/add-ons/${id(addOnId)}`, addOnSchema, body)).data,
    deleteAddOn: async (addOnId: string): Promise<void> => {
      await send('DELETE', `${base}/add-ons/${id(addOnId)}`, z.null());
    },
  };
}

/** Public customer discovery (docs/api/API_SPEC.md §28–31). */
export function createDiscoveryApi(client: ApiClient) {
  return {
    /** Paginated; `meta.pagination` carries page/pageSize/total/totalPages. */
    listRestaurants: (
      query: Partial<RestaurantListQuery> = {},
    ): Promise<ApiResult<RestaurantSummary[]>> =>
      client.request({
        method: 'GET',
        path: '/restaurants',
        schema: z.array(restaurantSummarySchema),
        query,
      }),
    getRestaurant: async (
      restaurantId: string,
      location: Partial<LocationQuery> = {},
    ): Promise<RestaurantDetails> =>
      (
        await client.request({
          method: 'GET',
          path: `/restaurants/${id(restaurantId)}`,
          schema: restaurantDetailsSchema,
          query: location,
        })
      ).data,
    getMenu: async (restaurantId: string): Promise<PublicMenu> =>
      (
        await client.request({
          method: 'GET',
          path: `/restaurants/${id(restaurantId)}/menu`,
          schema: publicMenuSchema,
        })
      ).data,
    search: async (query: Partial<SearchQuery> & { q: string }): Promise<SearchResult> =>
      (await client.request({ method: 'GET', path: '/search', schema: searchResultSchema, query }))
        .data,
  };
}
