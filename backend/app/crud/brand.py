from app.crud.base import CRUDBase
from app.models.brand import Brand
from app.schemas.brand import BrandCreate, BrandUpdate


class CRUDBrand(CRUDBase[Brand, BrandCreate, BrandUpdate]):
    pass


crud_brand = CRUDBrand(Brand)
