const dashboards = document.querySelectorAll('[data-economy-dashboard]');
dashboards.forEach(dashboard => {
  const tabs = [...dashboard.querySelectorAll('[role="tab"]')];
  function select(tab, focus=false) {
    tabs.forEach(button => {
      const active = button === tab;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      dashboard.querySelector('#' + button.getAttribute('aria-controls')).hidden = !active;
    });
    if (focus) tab.focus();
  }
  tabs.forEach((tab,index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next=(index+1)%tabs.length;
      else if (event.key === 'ArrowLeft') next=(index-1+tabs.length)%tabs.length;
      else if (event.key === 'Home') next=0;
      else if (event.key === 'End') next=tabs.length-1;
      else return;
      event.preventDefault(); select(tabs[next],true);
    });
  });
});
