# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Local Data

Application records, accounts, and login state are stored in this browser's local storage; evidence files use browser-local IndexedDB. They are not shared between browsers or devices and are removed if browser storage is cleared. This is suitable for a local/demo deployment, not secure multi-user production use. The invitation AI parser still uses the configured Lovable AI Gateway.

## Helpdesk building QR setup

Before deploying the building-based Helpdesk flow, apply `../server/migrations/20261014_add_helpdesk_building_context.sql` to the application database. An admin then opens **Helpdesk → Building locations**, creates a building under an active branch, enters the building geofence coordinates and radius, adds floors, then assigns areas to those floors (for example, Floor 1 → Pantry and Floor 3 → Conference Room). The city is shown from the selected branch master. The building must have valid geofence coordinates before it can be activated.

Use **Helpdesk QR codes → Building QR** to print the building's code. Employees, admins, and branch managers must sign in and allow device location to submit feedback or raise a ticket from that QR. Feedback requires a 1–5 star rating and a comment. The server checks the location against the selected building's geofence at submission. Admins can review received feedback and ratings under **Building feedback**. Existing category-based QR links remain available under **Legacy category QR**.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
