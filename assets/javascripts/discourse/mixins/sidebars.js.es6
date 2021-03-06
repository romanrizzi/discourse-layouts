import { default as discourseComputed, on, observes } from 'discourse-common/utils/decorators';
import { inject as service } from "@ember/service";
import { computed } from "@ember/object";
import { alias, or, not, and } from "@ember/object/computed";
import Mixin from "@ember/object/mixin";
import { scheduleOnce, bind, later, throttle, debounce } from "@ember/runloop";
import { htmlSafe } from "@ember/template";
import { iconHTML } from "discourse-common/lib/icon-library";
import DiscourseURL from "discourse/lib/url";
import { normalizeContext } from "../lib/layouts";

function hasWidgets(widgets) {
  return (widgets === undefined || widgets === null) || widgets.length > 0;
}

export default Mixin.create({
  router: service(),
  path: alias("router._router.currentPath"),
  responsiveView: false,
  showResponsiveMenu: and('isResponsive', 'responsiveMenuItems.length'),
  showLeftToggle: and('showSidebarToggles', 'leftSidebarEnabled'),
  showRightToggle: and('showSidebarToggles', 'rightSidebarEnabled'),
  customSidebarProps: {},
  eitherSidebarVisible: or('leftSidebarVisible', 'rightSidebarVisible'),
  neitherSidebarVisible: not('eitherSidebarVisible'),
  leftSidebarEnabled: computed('leftWidgets', function() { return hasWidgets(this.leftWidgets) }),
  rightSidebarEnabled: computed('rightWidgets', function() { return hasWidgets(this.rightWidgets) }),
  hasRightSidebar: and('rightSidebarEnabled', 'rightSidebarVisible'),
  hasLeftSidebar: and('leftSidebarEnabled', 'leftSidebarVisible'),
  
  @discourseComputed('context', 'isResponsive')
  canHideRightSidebar(context, isResponsive) {
    return this.canHide(context, 'right', isResponsive);
  },
  
  @discourseComputed('context', 'isResponsive')
  canHideLeftSidebar(context, isResponsive) {
    return this.canHide(context, 'left', isResponsive);
  },
  
  canHide(context, side, isResponsive) {
    return !isResponsive &&
      this.siteSettings[`layouts_sidebar_${side}_can_hide`].split('|')
        .map(normalizeContext)
        .indexOf(context) > -1;
  },
  
  @discourseComputed('rightSidebarVisible')
  toggleRightSidebarIcon(visible) {
    return visible ? 'minus' : 'plus';
  },
  
  @discourseComputed('leftSidebarVisible')
  toggleLeftSidebarIcon(visible) {
    return visible ? 'minus' : 'plus';
  },

  @on('init')
  setupMixin() {
    const settings = this.siteSettings;
    const sidebarPadding = 20;
    const mainLeftOffset = settings.layouts_sidebar_left_width + sidebarPadding;
    const mainRightOffset = settings.layouts_sidebar_right_width + sidebarPadding;
    scheduleOnce('afterRender', () => {
      this.handleWindowResize();
      $(window).on('resize', () => debounce(this, this.handleWindowResize, 100));
      
      const root = document.documentElement;
      root.style.setProperty('--mainLeftOffset', `${this.mainLeftOffset}px`);
      root.style.setProperty('--mainRightOffset', `${this.mainRightOffset}px`);
    });
    this.appEvents.on('sidebar:toggle', this, this.toggleSidebars);
    
    const isResponsive = this.get('isResponsive');
    let leftSidebarVisible = !isResponsive;
    let rightSidebarVisible = !isResponsive;
    
    this.setProperties({
      mainLeftOffset,
      mainRightOffset,
      leftSidebarVisible,
      rightSidebarVisible
    });
  },

  @on('willDestroy')
  teardownMixin() {
    $(window).off('resize', bind(this, this.handleWindowResize));
    this.appEvents.off('sidebar:toggle', this, this.toggleSidebars);
  },
  
  @observes('path')
  resetHasWidgets() {
    this.setProperties({
      leftWidgets: undefined,
      rightWidgets: undefined
    })
  },
  
  toggleSidebars(opts) {
    const isResponsive = this.isResponsive;
    const { side, value, target } = opts;
    
    if (
      (target === 'responsive' && !isResponsive) ||
      (target === 'desktop' && isResponsive)
    ) return;
    
    let sides = side ? [side] : ['left', 'right'];
    
    sides.forEach(side => {
      const newVal = [true, false].includes(value) ? value : !Boolean(this[`${side}SidebarVisible`]);
      
      if (isResponsive) {
        const $sidebar = $(`.sidebar.${side}`);      
        const $sidebarCloak = $(".sidebar-cloak");
              
        if (newVal) {
          $sidebar.addClass('open');
          $sidebarCloak.css("opacity", 0.5);
          $sidebarCloak.show();
        } else {
          $sidebar.removeClass('open');
          $sidebarCloak.css("opacity", 0);
          $sidebarCloak.hide();
        }
      }
            
      this.set(`${side}SidebarVisible`, newVal);
    });
  },
  
  handleWindowResize() {
    const windowWidth = $(window).width();
    const threshold = this.siteSettings.layouts_sidebar_responsive_threshold;
    const responsiveView = this.get("responsiveView");
    
    if (windowWidth < Number(threshold)) {
      if (!responsiveView) {
        this.setProperties({
          responsiveView: true,
          leftSidebarVisible: false,
          rightSidebarVisible: false
        });
      }
    } else if (responsiveView) {
      this.setProperties({
        responsiveView: false,
        leftSidebarVisible: true,
        rightSidebarVisible: true
      });
    }
  },

  @discourseComputed('responsiveView')
  isResponsive(responsiveView) {
    const mobileView = this.get('site.mobileView');
    return mobileView || responsiveView;
  },

  @discourseComputed(
    'path',
    'loading',
    'isResponsive',
    'hasRightSidebar',
    'hasLeftSidebar',
    'showResponsiveMenu'
  ) mainClasses(path, loading, isResponsive, hasRight, hasLeft, showMenu) {
    let p = path.split('.');
    let classes = `${p[0]} ${p[1].split(/(?=[A-Z])/)[0]}`;
    
    if (hasLeft || hasRight) {
      classes += ' has-sidebars';
    } else {
      classes += ' no-sidebars';
    }
    if (hasLeft) classes += ' left-sidebar';
    if (hasRight) classes += ' right-sidebar';
    if (isResponsive) {
      classes += ' is-responsive';
      
      if (showMenu) {
        classes += ' has-menu';
      }
    }
    if (loading) classes + ' loading';
    
    return classes;
  },

  @discourseComputed('isResponsive', 'leftSidebarVisible')
  leftClasses(isResponsive, visible) {
    return this.buildSidebarClasses(isResponsive, visible, 'left');
  },
  
  @discourseComputed('isResponsive', 'rightSidebarVisible')
  rightClasses(isResponsive, visible) {
    return this.buildSidebarClasses(isResponsive, visible, 'right');
  },
  
  buildSidebarClasses(isResponsive, visible, side) {
    let classes = '';
    if (isResponsive) {
      classes += 'is-responsive';
      if (visible) classes += ' open';
    } else {
      if (!visible) classes += ' not-visible';
    }
    classes += ` ${this.siteSettings[`layouts_sidebar_${side}_position`]}`;
    return classes;
  },
  
  @discourseComputed('path', 'hasLeftSidebar', 'hasRightSidebar')
  mainStyle(path, hasLeftSidebar, hasRightSidebar) {
    if (this.site.mobileView) return;
    const mainLeftOffset = this.mainLeftOffset;
    const mainRightOffset = this.mainRightOffset;
    let offset = 0;
    let style = '';
    if (hasLeftSidebar) {
      offset += mainLeftOffset;
    }
    if (hasRightSidebar) {
      offset += mainRightOffset;
    }
    style += `width: ${offset > 0 ? `calc(100% - ${offset}px)` : '100%'}`;
    return htmlSafe(style);
  },

  @discourseComputed('path', 'isResponsive', 'leftSidebarVisible')
  leftStyle(path, isResponsive, visible) {
    const width = this.siteSettings.layouts_sidebar_left_width;
    let string;
    if (isResponsive) {
      string = `width: 100vw; transform: translateX(${visible ? '0' : `-100vw`});`
    } else {
      string = `width: ${visible ? width : 0}px;`;
    }
    return htmlSafe(string);
  },

  @discourseComputed('path', 'isResponsive', 'rightSidebarVisible')
  rightStyle(path, isResponsive, visible) {
    const width = this.siteSettings.layouts_sidebar_right_width;
    let string;
    if (isResponsive) {
      string = `width: 100vw; transform: translateX(${visible ? `0` : `100vw`});`
    } else {
      string = `width: ${visible ? width : 0}px;`;
    }
    return htmlSafe(string);
  },
  
  @discourseComputed('leftSidebarEnabled', 'rightSidebarEnabled')
  responsiveMenuItems() {
    const inputs = this.siteSettings.layouts_mobile_menu.split('|');
    return inputs.reduce((items, input) => {
      let firstSeperator = input.indexOf("~~");
      let lastSeperator = input.lastIndexOf("~~");
      let type = input.substring(0, firstSeperator), icon, url;
      let isLink = type === 'link';
      let isSidebarToggle = ['left', 'right'].indexOf(type) > -1;
      
      if (isLink) {
        icon = input.substring(firstSeperator + 2, lastSeperator);
        url = input.substring(lastSeperator + 2, input.length);
      } else if (isSidebarToggle) {
        icon = input.substring(firstSeperator + 2, input.length);
      }
      
      if (icon) {
        let iconClass, iconHtml, action, actionParam;
                
        if (isSidebarToggle && this[`${type}SidebarEnabled`]) {
          iconClass = `responsive-toggle ${type}`;
          action = 'toggleSidebar';
          actionParam = type;
        } else if (isLink) {
          iconClass = 'responsive-link';
          action = 'goToLink';
          actionParam = url;
        }
        
        try {
          let iconUrl = new URL(icon);
          iconHtml = htmlSafe(`<img src=${iconUrl.href} class="image-icon">`);
        } catch (_) {
          iconHtml = iconHTML(icon).htmlSafe(); 
        }
          
        if (iconHtml && iconClass && action && actionParam) {
          items.push({
            icon: iconHtml,
            class: iconClass,
            action,
            actionParam
          });
        }
      }
      
      return items;
    }, []);
  },
  
  actions: {
    toggleSidebar(side) {
      this.appEvents.trigger('sidebar:toggle', { side })
    },

    setWidgets(side, widgets) {
      this.set(`${side}Widgets`, widgets);
    },
    
    goToLink(link) {
      DiscourseURL.routeTo(link);
    }
  }
});
