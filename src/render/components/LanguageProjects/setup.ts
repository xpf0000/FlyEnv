import { reactiveBind } from '@/util/Index'
import { AllAppModule } from '@/core/type'
import { Project } from './Project'

const ProjectSetups: Partial<Record<AllAppModule, Project>> = {}

export const ProjectSetup = (typeFlag: AllAppModule): Project => {
  if (!ProjectSetups?.[typeFlag]) {
    const p = reactiveBind(new Project(typeFlag))

    p.initDirs()
    p.fetchProject()
    ProjectSetups[typeFlag] = p
  }
  return ProjectSetups[typeFlag]!
}
