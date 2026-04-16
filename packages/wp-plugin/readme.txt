=== Smart Property Widget Sync ===
Contributors: smartpropertywidget
Tags: property, real estate, widget, sync, api
Requires at least: 5.0
Tested up to: 6.4
Stable tag: 1.0.0
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Syncs property data from SPW Dashboard for instant widget performance on your WordPress site.

== Description ==

Smart Property Widget Sync connects your WordPress site to the SPW Dashboard, enabling:

* **Real-time Sync**: Receive webhook notifications when property data changes
* **Local JSON Caching**: Store locations, property types, features, and labels locally for instant widget dropdown population (<50ms)
* **OG Meta Tags**: Automatic Open Graph tags for property pages to enhance social sharing
* **Daily Fallback Sync**: Automatic daily synchronization ensures data is always up-to-date

= Features =

* Easy configuration through WordPress admin
* Secure webhook endpoint with HMAC signature verification
* Manual sync option from the settings page
* Version tracking to minimize unnecessary data transfers
* Comprehensive logging for debugging

= Requirements =

* WordPress 5.0 or higher
* PHP 7.4 or higher
* An active SPW Dashboard account with API credentials

== Installation ==

1. Upload the `spw-sync` folder to the `/wp-content/plugins/` directory
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Go to Settings → SPW Sync to configure your API credentials
4. Copy the webhook URL and add it to your SPW Dashboard settings
5. Click "Sync Now" to perform the initial data synchronization

== Frequently Asked Questions ==

= Where do I get my API credentials? =

Log in to your SPW Dashboard, go to Settings → API Keys to generate your API key and webhook secret.

= Where is the synced data stored? =

Data is stored as JSON files in `/wp-content/spw-data/`. This directory is created automatically when the plugin is activated.

= How often does the data sync? =

Data syncs in real-time via webhooks when changes occur in the Dashboard. Additionally, there's a daily fallback sync to ensure data consistency.

= Can I manually trigger a sync? =

Yes! Go to Settings → SPW Sync and click the "Sync Now" button.

= How do I enable OG tags for property pages? =

OG tags are enabled by default. Make sure the "Property URL Pattern" matches your site's property page URLs. Use `{reference}` or `{id}` as placeholders.

== Changelog ==

= 1.0.0 =
* Initial release
* Real-time webhook sync
* Local JSON file caching
* OG meta tag generation
* WordPress admin settings page
* Manual sync functionality
* Daily fallback cron sync

== Upgrade Notice ==

= 1.0.0 =
Initial release of Smart Property Widget Sync.
