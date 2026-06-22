-- Create Enum for Ad Formats
CREATE TYPE ad_format AS ENUM ('banner', 'video', 'popup', 'scroll_sticky');

-- Create Ads Campaigns Table
CREATE TABLE public.ads_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    target_countries JSONB, -- Array of ISO2 country codes (e.g. ["IN", "US"]). NULL means global.
    target_pages JSONB, -- Array of pathnames (e.g. ["/", "/recharge"]). NULL means all pages.
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create Ads Creatives Table
CREATE TABLE public.ads_creatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.ads_campaigns(id) ON DELETE CASCADE,
    format ad_format NOT NULL,
    placement_key TEXT NOT NULL, -- e.g., 'home_hero', 'recharge_sidebar', 'global_popup'
    media_url TEXT NOT NULL,
    destination_url TEXT,
    title TEXT,
    description TEXT,
    -- Time controls specifically requested for popup/video ads
    display_delay_seconds INTEGER DEFAULT 0,
    display_duration_seconds INTEGER, -- NULL means it stays until dismissed
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create Ads Analytics Table
CREATE TABLE public.ads_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creative_id UUID NOT NULL REFERENCES public.ads_creatives(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click', 'dismiss')),
    ip_hash TEXT, -- Hashed IP for privacy
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ads_campaigns_updated_at
BEFORE UPDATE ON public.ads_campaigns
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER trg_ads_creatives_updated_at
BEFORE UPDATE ON public.ads_creatives
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- Enable RLS
ALTER TABLE public.ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Public can read active campaigns and creatives
CREATE POLICY "Public can view active campaigns" ON public.ads_campaigns
    FOR SELECT TO public USING (is_active = true);

CREATE POLICY "Public can view active creatives" ON public.ads_creatives
    FOR SELECT TO public USING (is_active = true);

-- Public can insert analytics
CREATE POLICY "Public can insert analytics" ON public.ads_analytics
    FOR INSERT TO public WITH CHECK (true);

-- Admins can do everything
CREATE POLICY "Admins can do everything on campaigns" ON public.ads_campaigns
    FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'super_admin');

CREATE POLICY "Admins can do everything on creatives" ON public.ads_creatives
    FOR ALL TO authenticated USING (auth.jwt() ->> 'role' = 'super_admin');

CREATE POLICY "Admins can view analytics" ON public.ads_analytics
    FOR SELECT TO authenticated USING (auth.jwt() ->> 'role' = 'super_admin');
