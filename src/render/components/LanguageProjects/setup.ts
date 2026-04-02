import { reactiveBind } from '@/util/Index'
import { AllAppModule } from '@/core/type'
import { Project } from './Project'

const ProjectSetups: Partial<Record<AllAppModule, Project>> = {}

export const ProjectSetup = (typeFlag: AllAppModule): Project => {
  if (!ProjectSetups?.[typeFlag]) {
    console.log('ProjectSetup not found !!!', typeFlag)
    const p = reactiveBind(new Project(typeFlag))
    ProjectSetups[typeFlag] = p
    p.initDirs()
    p.fetchProject()
  }
  console.log('ProjectSetup found !!!', typeFlag)
  return ProjectSetups[typeFlag]!
}
