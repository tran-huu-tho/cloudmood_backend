import { Controller, Get } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('mobile/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async getCategories() {
    return this.categoriesService.getCategories();
  }
}
