# Customer App — Stitch Design Index

Inventory of the Google Stitch exports supplied by the project owner in this directory.
The design files are **reference only** and are kept exactly as exported: folder names, `code.html`
and `screen.png` are not renamed, edited or converted.

* **Folder names are Stitch's own export names.** Their `1._` … `4._` prefixes are Stitch's
  per-group numbering, not the app's screen order, so the prefixes repeat across groups.
* **The screen order is set by `../../SCREEN_PLAN.md`.** The `#` column below is an index
  number for this inventory only.
* **The "Plan batch" column is a mapping suggestion.** Batches 01 and 02 name their screens
  explicitly in `SCREEN_PLAN.md`. Later batches list only a candidate scope there, so those rows
  follow the closest candidate scope and must be confirmed before each batch starts
  (`SCREEN_PLAN.md` §7–§20).
* **Design status:** `PROVIDED` means `code.html` and `screen.png` are both present.
* **Implementation status:** mirrors `SCREEN_PLAN.md` (`TODO`, `IN_PROGRESS`, `REVIEW`, `APPROVED`, `BLOCKED`).

Inventory taken 2026-09-28: 84 screens, 4 image assets, 1 design system file.

## Design system

| Folder         | Files       | Notes                                                                                        |
| -------------- | ----------- | -------------------------------------------------------------------------------------------- |
| `warm_kinetic` | `DESIGN.md` | "Warm Kinetic" design tokens: colour roles (primary `#a04100`, primary container `#ff6b00`), typography (Plus Jakarta Sans), shape and spacing. |

## Screens

| #   | Screen                              | Folder                                 | Files                   | Plan batch                   | Design   | Impl |
| --- | ----------------------------------- | -------------------------------------- | ----------------------- | ---------------------------- | -------- | ---- |
| 1   | Splash                              | `1._splash_screen`                     | code.html, screen.png   | 01 — Authentication          | PROVIDED | REVIEW |
| 2   | Welcome                             | `2._welcome_screen`                    | code.html, screen.png   | 01 — Authentication          | PROVIDED | REVIEW |
| 3   | Login                               | `3._login_screen`                      | code.html, screen.png   | 01 — Authentication          | PROVIDED | REVIEW |
| 4   | Create Account                      | `4._create_account_screen`             | code.html, screen.png   | 01 — Authentication          | PROVIDED | REVIEW |
| 5   | Phone Verification                  | `1._phone_verification_screen`         | code.html, screen.png   | 02 — Account Verification    | PROVIDED | REVIEW |
| 6   | Email Verification                  | `2._email_verification_screen`         | code.html, screen.png   | 02 — Account Verification    | PROVIDED | REVIEW |
| 7   | Forgot Password                     | `3._forgot_password_screen`            | code.html, screen.png   | 02 — Account Verification    | PROVIDED | REVIEW |
| 8   | Reset Password                      | `4._reset_password_screen`             | code.html, screen.png   | 02 — Account Verification    | PROVIDED | REVIEW |
| 9   | Home                                | `1._home_screen`                       | code.html, screen.png   | 03 — Home & Discovery        | PROVIDED | TODO |
| 10  | Restaurant Discovery                | `2._restaurant_discovery_screen`       | code.html, screen.png   | 03 — Home & Discovery        | PROVIDED | TODO |
| 11  | Search                              | `3._search_screen`                     | code.html, screen.png   | 03 — Home & Discovery        | PROVIDED | TODO |
| 12  | Search Results                      | `4._search_results_screen`             | code.html, screen.png   | 03 — Home & Discovery        | PROVIDED | TODO |
| 13  | Restaurant Listing                  | `1._restaurant_listing_screen`         | code.html, screen.png   | 03 — Home & Discovery        | PROVIDED | TODO |
| 14  | Restaurant Filters                  | `2._restaurant_filters_screen`         | code.html, screen.png   | 03 — Home & Discovery        | PROVIDED | TODO |
| 15  | Restaurant Sort                     | `3._restaurant_sort_screen`            | code.html, screen.png   | 03 — Home & Discovery        | PROVIDED | TODO |
| 16  | Restaurant Details                  | `2._restaurant_details_screen`         | code.html, screen.png   | 04 — Restaurant Browsing     | PROVIDED | TODO |
| 17  | Restaurant Menu                     | `3._restaurant_menu_screen`            | code.html, screen.png   | 04 — Restaurant Browsing     | PROVIDED | TODO |
| 18  | Category Menu Section View          | `1._category_menu_section_view`        | code.html, screen.png   | 04 — Restaurant Browsing     | PROVIDED | TODO |
| 19  | Menu Item Details                   | `4._menu_item_details_screen`          | code.html, screen.png   | 04 — Restaurant Browsing     | PROVIDED | TODO |
| 20  | Cart                                | `cart`                                 | code.html, screen.png   | 05 — Cart                    | PROVIDED | TODO |
| 21  | Cart Empty                          | `cart_empty`                           | code.html, screen.png   | 05 — Cart                    | PROVIDED | TODO |
| 22  | Edit Cart Item                      | `edit_cart_item`                       | code.html, screen.png   | 05 — Cart                    | PROVIDED | TODO |
| 23  | Add-ons Selection                   | `add_ons_selection`                    | code.html, screen.png   | 05 — Cart                    | PROVIDED | TODO |
| 24  | Cart Validation / Updated Cart      | `cart_validation_updated_cart`         | code.html, screen.png   | 05 — Cart                    | PROVIDED | TODO |
| 25  | Checkout                            | `checkout`                             | code.html, screen.png   | 06 — Checkout                | PROVIDED | TODO |
| 26  | Delivery Address Selection          | `delivery_address_selection`           | code.html, screen.png   | 06 — Checkout                | PROVIDED | TODO |
| 27  | Delivery Instructions               | `delivery_instructions`                | code.html, screen.png   | 06 — Checkout                | PROVIDED | TODO |
| 28  | Promotion Selection                 | `promotion_selection`                  | code.html, screen.png   | 06 — Checkout                | PROVIDED | TODO |
| 29  | Apply Promotion                     | `1._apply_promotion_screen`            | code.html, screen.png   | 06 — Checkout                | PROVIDED | TODO |
| 30  | Payment Method Selection            | `payment_method_selection`             | code.html, screen.png   | 06 — Checkout                | PROVIDED | TODO |
| 31  | Order Summary                       | `2._order_summary_screen`              | code.html, screen.png   | 06 — Checkout                | PROVIDED | TODO |
| 32  | Order Confirmation                  | `2._order_confirmation_screen`         | code.html, screen.png   | 07 — Order Creation          | PROVIDED | TODO |
| 33  | Payment Processing                  | `4._payment_processing_screen`         | code.html, screen.png   | 07 — Order Creation          | PROVIDED | TODO |
| 34  | Payment Failed                      | `1._payment_failed_screen`             | code.html, screen.png   | 07 — Order Creation          | PROVIDED | TODO |
| 35  | Checkout Error                      | `3._checkout_error_screen`             | code.html, screen.png   | 07 — Order Creation          | PROVIDED | TODO |
| 36  | Order Tracking                      | `3._order_tracking_screen`             | code.html, screen.png   | 08 — Order Tracking          | PROVIDED | TODO |
| 37  | Order Status                        | `4._order_status_screen`               | code.html, screen.png   | 08 — Order Tracking          | PROVIDED | TODO |
| 38  | Restaurant Preparing (state)        | `1._restaurant_preparing_state`        | code.html, screen.png   | 08 — Order Tracking          | PROVIDED | TODO |
| 39  | Ready for Pickup (state)            | `2._ready_for_pickup_state`            | code.html, screen.png   | 08 — Order Tracking          | PROVIDED | TODO |
| 40  | Rider Assigned (state)              | `3._rider_assigned_state`              | code.html, screen.png   | 08 — Order Tracking          | PROVIDED | TODO |
| 41  | Rider En Route (state)              | `4._rider_en_route_state`              | code.html, screen.png   | 08 — Order Tracking          | PROVIDED | TODO |
| 42  | Out for Delivery (state)            | `2._out_for_delivery_state`            | code.html, screen.png   | 08 — Order Tracking          | PROVIDED | TODO |
| 43  | Rider Arrived (state)               | `1._rider_arrived_state`               | code.html, screen.png   | 08 — Order Tracking          | PROVIDED | TODO |
| 44  | Delivered (state)                   | `3._delivered_state`                   | code.html, screen.png   | 08 — Order Tracking          | PROVIDED | TODO |
| 45  | Order Cancelled (state)             | `4._order_cancelled_state`             | code.html, screen.png   | 08 — Order Tracking          | PROVIDED | TODO |
| 46  | Cancellation Request                | `cancellation_request`                 | code.html, screen.png   | 08 — Order Tracking          | PROVIDED | TODO |
| 47  | Order History                       | `order_history`                        | code.html, screen.png   | 09 — Order History           | PROVIDED | TODO |
| 48  | Order Details                       | `order_details`                        | code.html, screen.png   | 09 — Order History           | PROVIDED | TODO |
| 49  | Past Order Details                  | `past_order_details`                   | code.html, screen.png   | 09 — Order History           | PROVIDED | TODO |
| 50  | Reorder — Review Availability       | `reorder_review_availability`          | code.html, screen.png   | 09 — Order History           | PROVIDED | TODO |
| 51  | Write Restaurant Review             | `write_restaurant_review`              | code.html, screen.png   | 10 — Reviews                 | PROVIDED | TODO |
| 52  | Review Submitted                    | `review_submitted`                     | code.html, screen.png   | 10 — Reviews                 | PROVIDED | TODO |
| 53  | My Reviews                          | `my_reviews`                           | code.html, screen.png   | 10 — Reviews                 | PROVIDED | TODO |
| 54  | Review Details                      | `review_details`                       | code.html, screen.png   | 10 — Reviews                 | PROVIDED | TODO |
| 55  | Report Review                       | `report_review`                        | code.html, screen.png   | 10 — Reviews                 | PROVIDED | TODO |
| 56  | Profile                             | `profile`                              | code.html, screen.png   | 11 — Customer Profile        | PROVIDED | TODO |
| 57  | Account Security                    | `account_security`                     | code.html, screen.png   | 11 — Customer Profile        | PROVIDED | TODO |
| 58  | Change Password                     | `change_password`                      | code.html, screen.png   | 11 — Customer Profile        | PROVIDED | TODO |
| 59  | Verification Settings               | `verification_settings`                | code.html, screen.png   | 11 — Customer Profile        | PROVIDED | TODO |
| 60  | Add Address                         | `add_address`                          | code.html, screen.png   | 12 — Addresses               | PROVIDED | TODO |
| 61  | Edit Address                        | `edit_address`                         | code.html, screen.png   | 12 — Addresses               | PROVIDED | TODO |
| 62  | Address Details                     | `address_details`                      | code.html, screen.png   | 12 — Addresses               | PROVIDED | TODO |
| 63  | Location Selection                  | `4._location_selection_screen`         | code.html, screen.png   | 12 — Addresses (or 03)       | PROVIDED | TODO |
| 64  | Notifications                       | `notifications`                        | code.html, screen.png   | 13 — Notifications           | PROVIDED | TODO |
| 65  | Notification Details                | `notification_details`                 | code.html, screen.png   | 13 — Notifications           | PROVIDED | TODO |
| 66  | Notification Preferences            | `notification_preferences`             | code.html, screen.png   | 13 — Notifications           | PROVIDED | TODO |
| 67  | Help Center                         | `help_center`                          | code.html, screen.png   | 14 — Support                 | PROVIDED | TODO |
| 68  | Support Categories                  | `support_categories`                   | code.html, screen.png   | 14 — Support                 | PROVIDED | TODO |
| 69  | Create Support Ticket               | `create_support_ticket`                | code.html, screen.png   | 14 — Support                 | PROVIDED | TODO |
| 70  | Ticket Details                      | `ticket_details`                       | code.html, screen.png   | 14 — Support                 | PROVIDED | TODO |
| 71  | Support Ticket Status               | `support_ticket_status`                | code.html, screen.png   | 14 — Support                 | PROVIDED | TODO |
| 72  | Support Chat                        | `support_chat`                         | code.html, screen.png   | 14 — Support                 | PROVIDED | TODO |
| 73  | Settings                            | `settings`                             | code.html, screen.png   | 15 — Settings                | PROVIDED | TODO |
| 74  | Privacy & Data Controls             | `privacy_data_controls`                | code.html, screen.png   | 15 — Settings                | PROVIDED | TODO |
| 75  | Language Settings                   | `language_settings`                    | code.html, screen.png   | 15 — Settings                | PROVIDED | TODO |
| 76  | Logout Confirmation (modal)         | `logout_confirmation_modal`            | code.html, screen.png   | 15 — Settings                | PROVIDED | TODO |
| 77  | About QuickBite                     | `about_quickbite`                      | code.html, screen.png   | 16+ — Remaining              | PROVIDED | TODO |
| 78  | Privacy Policy                      | `privacy_policy`                       | code.html, screen.png   | 16+ — Remaining              | PROVIDED | TODO |
| 79  | Terms & Conditions                  | `terms_conditions`                     | code.html, screen.png   | 16+ — Remaining              | PROVIDED | TODO |
| 80  | Shared — Confirmation State         | `shared_confirmation_state_screen`     | code.html, screen.png   | 16+ — Remaining (shared)     | PROVIDED | TODO |
| 81  | Shared — Empty State                | `shared_empty_state_screen`            | code.html, screen.png   | 16+ — Remaining (shared)     | PROVIDED | TODO |
| 82  | Shared — Error / Retry              | `shared_error_retry_screen`            | code.html, screen.png   | 16+ — Remaining (shared)     | PROVIDED | TODO |
| 83  | Shared — Loading Skeleton           | `shared_loading_skeleton_state`        | code.html, screen.png   | 16+ — Remaining (shared)     | PROVIDED | TODO |
| 84  | Shared — Offline State              | `shared_offline_state_screen`          | code.html, screen.png   | 16+ — Remaining (shared)     | PROVIDED | TODO |

## Image assets (not screens)

These folders contain only a `screen.png` food photograph (no `code.html`). They are artwork
references, not screens.

| Folder                                                                              | Files      |
| ----------------------------------------------------------------------------------- | ---------- |
| `artisanal_gourmet_smash_burger_with_melting_cheddar_cheese_crisp_lettuce`          | screen.png |
| `authentic_japanese_ramen_bowl_with_tender_chashu_pork_seasoned_soft_boiled_egg`    | screen.png |
| `fresh_colorful_healthy_salmon_poke_bowl_with_sliced_avocado_edamame_cucumber`      | screen.png |
| `fresh_italian_wood_fired_neapolitan_pizza_with_bubbling_mozzarella_fresh_basil`    | screen.png |

## Notes for batch planning (decisions for the project owner)

1. **Several candidate batches exceed the 4-screen default** (03, 05, 06, 08, 10, 14). They need
   splitting in `SCREEN_PLAN.md` before implementation (`CLAUDE.md` §23).
2. **Screen #63 (Location Selection)** could belong to 03 (choosing a delivery area on Home) or to 12
   (Addresses). Its batch needs to be decided.
3. **Screen #75 (Language Settings)** needs a check against the product specification before it is
   implemented. `SCREEN_PLAN.md` §19 says not to add unsupported settings.
4. **Screens #80–#84 (shared states)** are likely reusable components rather than routes. They may be
   implemented alongside the first batch that needs each state.
5. **External image URLs.** The exported `code.html` files load their images, including the
   QuickBite logo, from `lh3.googleusercontent.com` URLs. Implementations must use local assets
   (logo: `apps/customer/assets/logo/`) instead of those URLs.
