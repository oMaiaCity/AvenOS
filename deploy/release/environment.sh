#!/usr/bin/env bash

configure_platform_environment() {
  case "$1" in
    next)
      public_domain=next.aven.ceo
      api_domain=api.next.aven.ceo
      checkout_domain=portal.next.aven.ceo
      site_source_branch=next
      site_deployment_branch=deploy/next
      ;;
    production)
      public_domain=aven.ceo
      api_domain=api.aven.ceo
      checkout_domain=portal.aven.ceo
      site_source_branch=production
      site_deployment_branch=deploy/production
      ;;
    *)
      echo 'platform environment must be next or production' >&2
      return 64
      ;;
  esac
}
