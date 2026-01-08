import type { Schema, Struct } from '@strapi/strapi';

export interface HomepageBanner extends Struct.ComponentSchema {
  collectionName: 'components_homepage_banners';
  info: {
    displayName: 'Banner';
  };
  attributes: {
    bannerImage: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    heading: Schema.Attribute.String;
    link: Schema.Attribute.String;
    subHeading: Schema.Attribute.Text;
  };
}

export interface HomepageBestSeller extends Struct.ComponentSchema {
  collectionName: 'components_homepage_best_sellers';
  info: {
    displayName: 'Best Seller';
  };
  attributes: {
    products: Schema.Attribute.Relation<'oneToMany', 'api::product.product'>;
    section_subtitle: Schema.Attribute.Text;
    section_title: Schema.Attribute.String;
  };
}

export interface HomepageFeatureCategories extends Struct.ComponentSchema {
  collectionName: 'components_homepage_feature_categories';
  info: {
    displayName: 'Feature Categories';
  };
  attributes: {
    categories: Schema.Attribute.Component<'homepage.select-category', true> &
      Schema.Attribute.SetMinMax<
        {
          max: 3;
          min: 3;
        },
        number
      >;
    section_subtitle: Schema.Attribute.Text;
    section_title: Schema.Attribute.String;
  };
}

export interface HomepageReview extends Struct.ComponentSchema {
  collectionName: 'components_homepage_reviews';
  info: {
    displayName: 'Review';
  };
  attributes: {
    isActive: Schema.Attribute.Boolean;
    name: Schema.Attribute.String;
    review: Schema.Attribute.Text;
    stars: Schema.Attribute.Integer &
      Schema.Attribute.SetMinMax<
        {
          max: 5;
        },
        number
      >;
  };
}

export interface HomepageReviewSection extends Struct.ComponentSchema {
  collectionName: 'components_homepage_review_sections';
  info: {
    displayName: 'Review Section';
  };
  attributes: {
    reviews: Schema.Attribute.Component<'homepage.review', true>;
    sectionSubtitle: Schema.Attribute.Text;
    sectionTitle: Schema.Attribute.String;
  };
}

export interface HomepageSelectCategory extends Struct.ComponentSchema {
  collectionName: 'components_homepage_select_categories';
  info: {
    displayName: 'Select Category';
  };
  attributes: {
    category: Schema.Attribute.Relation<'oneToOne', 'api::category.category'>;
    startingFrom: Schema.Attribute.String;
  };
}

export interface InputFieldsAddress extends Struct.ComponentSchema {
  collectionName: 'components_input_fields_addresses';
  info: {
    displayName: 'address';
  };
  attributes: {
    address: Schema.Attribute.Text;
    city: Schema.Attribute.String;
    label: Schema.Attribute.String;
    pincode: Schema.Attribute.String;
  };
}

export interface InputFieldsEmail extends Struct.ComponentSchema {
  collectionName: 'components_input_fields_emails';
  info: {
    displayName: 'email';
  };
  attributes: {
    email: Schema.Attribute.Email;
  };
}

export interface InputFieldsPhone extends Struct.ComponentSchema {
  collectionName: 'components_input_fields_phones';
  info: {
    displayName: 'phone';
  };
  attributes: {
    phone: Schema.Attribute.String;
  };
}

export interface OrderOrderItem extends Struct.ComponentSchema {
  collectionName: 'components_order_order_items';
  info: {
    displayName: 'Order Item';
    icon: 'shopping-cart';
  };
  attributes: {
    product: Schema.Attribute.Relation<'oneToOne', 'api::product.product'>;
    product_name: Schema.Attribute.String;
    quantity: Schema.Attribute.Integer;
    sku: Schema.Attribute.String;
    subtotal: Schema.Attribute.Decimal;
    unit_price: Schema.Attribute.Decimal;
    variation_id: Schema.Attribute.String;
  };
}

export interface ProductProductVariation extends Struct.ComponentSchema {
  collectionName: 'components_product_product_variations';
  info: {
    displayName: 'product_variation';
  };
  attributes: {
    ColorTone: Schema.Attribute.Enumeration<
      [
        'Beige',
        'Black',
        'Blue',
        'Bronze',
        'Brown',
        'Cream',
        'Golden',
        'Green',
        'Grey',
        'Mint',
        'Multi',
        'Red',
        'Silver',
        'White',
        'Yellow',
      ]
    >;
    Finish: Schema.Attribute.Enumeration<
      [
        'Acid',
        'Flamed',
        'Half honed and tumbled brushed',
        'Honed',
        'Honed/tumbled',
        'Natural',
        'Natural half honed And tumbled brushed',
        'r11',
        'Tumbled',
      ]
    >;
    PackSize: Schema.Attribute.Decimal;
    Pcs: Schema.Attribute.Integer;
    Per_m2: Schema.Attribute.Decimal;
    Price: Schema.Attribute.Decimal;
    Size: Schema.Attribute.Enumeration<
      [
        'SIZE 100X100',
        'SIZE 100X200',
        'SIZE 150X900',
        'SIZE 200X600',
        'SIZE 228X110',
        'SIZE 600X1200',
        'SIZE 600X150',
        'SIZE 600X600',
        'SIZE 600X900',
        'Mix Pack',
        'NA',
      ]
    >;
    SKU: Schema.Attribute.String;
    Stock: Schema.Attribute.Integer;
    Thickness: Schema.Attribute.Enumeration<
      [
        'THICKNESS 12-20MM',
        'THICKNESS 15-25MM',
        'THICKNESS 18MM',
        'THICKNESS 20MM',
        'THICKNESS 22MM',
        'THICKNESS 25-35MM',
        'THICKNESS 25-45MM',
        'THICKNESS 30-40MM',
        'THICKNESS 35-50MM',
        'THICKNESS 35-55MM',
        'THICKNESS 68MM',
      ]
    >;
    uuid: Schema.Attribute.Integer;
  };
}

export interface SeoMeta extends Struct.ComponentSchema {
  collectionName: 'components_seo_metas';
  info: {
    displayName: 'meta';
  };
  attributes: {
    canonical_tag: Schema.Attribute.String;
    meta_description: Schema.Attribute.Text;
    meta_title: Schema.Attribute.String;
    og_description: Schema.Attribute.Text;
    og_image: Schema.Attribute.Media<'images' | 'files' | 'videos' | 'audios'>;
    og_title: Schema.Attribute.String;
    robots: Schema.Attribute.String;
    schemas: Schema.Attribute.JSON;
    twitter_description: Schema.Attribute.Text;
    twitter_image: Schema.Attribute.Media<
      'images' | 'files' | 'videos' | 'audios'
    >;
    twitter_title: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'homepage.banner': HomepageBanner;
      'homepage.best-seller': HomepageBestSeller;
      'homepage.feature-categories': HomepageFeatureCategories;
      'homepage.review': HomepageReview;
      'homepage.review-section': HomepageReviewSection;
      'homepage.select-category': HomepageSelectCategory;
      'input-fields.address': InputFieldsAddress;
      'input-fields.email': InputFieldsEmail;
      'input-fields.phone': InputFieldsPhone;
      'order.order-item': OrderOrderItem;
      'product.product-variation': ProductProductVariation;
      'seo.meta': SeoMeta;
    }
  }
}
