FROM node:22-bookworm-slim AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# angular.json writes the build to ../backend/wwwroot
RUN npx ng build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src
COPY backend/backend.csproj backend/
RUN dotnet restore backend/backend.csproj
COPY backend/ backend/
COPY --from=web /src/backend/wwwroot backend/wwwroot
RUN dotnet publish backend/backend.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=api /app .
ENTRYPOINT ["dotnet", "backend.dll"]
