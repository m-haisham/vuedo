use crate::project::Project;

#[derive(Debug)]
pub struct ProjectRequirements {
    pub database: bool,
    pub artisan: bool,
}

impl ProjectRequirements {
    pub fn laravel_app() -> Self {
        Self {
            database: true,
            artisan: true,
        }
    }

    /// A Laravel app that is derived from another app
    pub fn laravel_app_derived() -> Self {
        Self {
            database: false,
            artisan: true,
        }
    }

    pub fn laravel_lib() -> Self {
        Self {
            database: false,
            artisan: true,
        }
    }

    pub fn flutter_app() -> Self {
        Self {
            database: false,
            artisan: false,
        }
    }
}

pub fn get_project_requirements(project: &Project) -> ProjectRequirements {
    match project {
        Project::Gateway => ProjectRequirements::laravel_app(),
        Project::Rates => ProjectRequirements::laravel_app(),
        Project::Search => ProjectRequirements::laravel_app(),
        Project::Operations => ProjectRequirements::laravel_app(),
        Project::Foundation => ProjectRequirements::laravel_app(),
        Project::Products => ProjectRequirements::laravel_app(),
        Project::ApiGateway => ProjectRequirements::laravel_app_derived(),
        Project::App => ProjectRequirements::laravel_app_derived(),
        Project::Nest => ProjectRequirements::laravel_app(),
        Project::SoPackageSerializer => ProjectRequirements::laravel_lib(),
        Project::ApiClients => ProjectRequirements::laravel_lib(),
        Project::GroundHandlingApp => ProjectRequirements::flutter_app(),
    }
}
